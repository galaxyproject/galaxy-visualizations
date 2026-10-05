import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import { contentText, normalizeContext } from "@earendil-works/pi-ai";
import { createGalaxyContext, type GalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import { resolveArtifacts } from "./artifacts";
import { compactionSettings, compactor } from "./compaction";
import type { Ask } from "./destructive";
import { connectGalaxy, galaxyFetch, type Galaxy, type GalaxyOptions } from "./galaxy";
import { annotate, galaxyTools, SETTLED } from "./galaxy-tools";
import { enaTools } from "./ena";
import { gtnTools } from "./gtn";
import { guards } from "./guards";
import { connect } from "./model";
import { excerpt, notebookTools } from "./notebook";
import { opsTools } from "./ops";
import { processTools } from "./processes";
import { GALAXY_READY, GALAXY_UNREACHABLE, systemText, type GalaxyStatus } from "./prompt";
import { probeWindow, resolve, type LlmConfig } from "./providers";
import type { RetryInfo } from "./retry";
import { skillRegistry, skillsTool } from "./skills";
import {
  asAgentTool,
  fail,
  result,
  type Artifact,
  type Binding,
  type Guard,
  type Capability,
  type Context,
  type OlitTool,
  type Python,
} from "./tool";
import { CONTEXT_SECTION, isRecordUpdate, RECORD_SECTION, sectionsOf } from "./sections";
import { followUpPrompt, stateReader, Watch, type Settled, type Watched } from "./watch";
import { pythonTool } from "./python";
import { visualizationTools } from "./visualizations";

export const MAX_STEPS = 100;
const DEFAULT_CAPABILITIES: Capability[] = ["llm", "local", "read", "write"];
const MIN_SECRET_LENGTH = 8;
const PRE_DISPATCH = new Set<Guard>([
  "repeated-failure",
  "settled-question",
  "galaxy-poll",
  "sra-fan-out",
]);

export interface SessionConfig extends LlmConfig {
  galaxy_root: string;
  /** Headless only; in the browser the user's session authenticates. */
  galaxy_key?: string;
  credentials?: RequestCredentials;
  history_id?: string;
  dataset_id?: string;
  session_id?: string;
  record_page_id?: string;
  ai_reserve_tokens?: number;
  ai_keep_recent_tokens?: number;
  ai_compaction?: boolean;
  capabilities?: Capability[];
  max_steps?: number;
}

export type LoopEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string }
  | {
      type: "tool_end";
      id: string;
      name: string;
      content: string;
      is_error: boolean;
      refused: boolean;
      guard?: Guard;
      /** Present when this call changed what the session is bound to. */
      binding?: SessionBinding;
      /** Galaxy work this call submitted, which the session now watches. */
      watch?: Watched[];
    }
  | { type: "llm_retry"; status: number; wait: number; attempt: number; of: number }
  | { type: "compacted" }
  | { type: "context_overflow" };

export interface TurnOptions {
  onEvent?: (event: LoopEvent) => void;
  artifacts?: Artifact[];
  /** Present when a user can approve a destructive operation. */
  ask?: Ask;
  signal?: AbortSignal;
}

/** The binding as the shell stores it. */
export interface SessionBinding {
  session_id?: string;
  record_page_id?: string;
  history_id?: string;
}

const reported = (b: Binding): SessionBinding => ({
  session_id: b.sessionId,
  record_page_id: b.pageId,
  history_id: b.historyId,
});

export interface TurnResult {
  logs: string[];
  /** The whole transcript, as pi holds it: what the next turn starts from. */
  messages: AgentMessage[];
  /** What this turn added. */
  new_messages: AgentMessage[];
  /** What the session is bound to after the turn; absent when the turn could not run. */
  binding?: SessionBinding;
  /** Galaxy work still unfinished after the turn, for a page that keeps it across a reload. */
  watching?: Watched[];
  done: boolean;
  aborted: boolean;
  exhausted: boolean;
  artifacts: Artifact[];
  usage: { input: number; output: number; cost: number | null };
  steps: number;
  max_steps: number;
  guards: Array<{ guard: Guard; tool?: string; steps?: number }>;
  /** What the session found; absent from a turn that could not run, which observed nothing. */
  diagnostics?: { galaxy: GalaxyStatus; capabilities: Capability[] };
  error?: { message: string };
}

const stamped = (m: AgentMessage): AgentMessage =>
  "timestamp" in m && m.timestamp ? m : ({ ...m, timestamp: Date.now() } as AgentMessage);

const brief = (value: unknown, limit = 300) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
};

/** A turn that could not run, as a result rather than an exception. */
export function failedTurn(transcripts: AgentMessage[], err: unknown): TurnResult {
  return {
    logs: [],
    messages: transcripts,
    new_messages: [],
    done: false,
    aborted: false,
    exhausted: false,
    artifacts: [],
    usage: { input: 0, output: 0, cost: null },
    steps: 0,
    max_steps: 0,
    guards: [],
    error: { message: String((err as Error)?.message ?? err) },
  };
}

/** The session's context as a section of the leading system message, replacing an earlier one. */
export function injectContext(transcripts: AgentMessage[], text: string): AgentMessage[] {
  if (!text || !transcripts.length) {
    return transcripts;
  }
  const [first, ...rest] = transcripts;
  const lead = first.role === "system" ? first : undefined;
  const updated = {
    ...(lead ?? { role: "system", content: "", timestamp: Date.now() }),
    sections: { ...sectionsOf(first), [CONTEXT_SECTION]: text },
  } as unknown as AgentMessage;
  return lead ? [updated, ...rest] : [updated, ...transcripts];
}

/**
 * The record excerpt as an update of its own section just before the last user turn, so it
 * sits beside what was asked; the update an earlier turn left is dropped.
 */
export function injectRecord(
  transcripts: AgentMessage[],
  text: string | undefined,
): AgentMessage[] {
  const kept = transcripts.filter((m) => !isRecordUpdate(m));
  if (!text) {
    return kept;
  }
  const message = {
    role: "system",
    content: "",
    sections: { [RECORD_SECTION]: text },
    timestamp: Date.now(),
  } as unknown as AgentMessage;
  const lastUser = kept.findLastIndex((m) => m.role === "user");
  return lastUser < 0
    ? [...kept, message]
    : [...kept.slice(0, lastUser), message, ...kept.slice(lastUser)];
}

function finishTool(): AgentTool {
  return {
    name: "finish",
    label: "finish",
    description: "Call when the task is complete, with a short summary.",
    parameters: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    } as unknown as AgentTool["parameters"],
    execute: async (_id, args) => ({
      ...result((args as { summary?: string }).summary ?? "done"),
      terminate: true,
    }),
  };
}

/** A tool whose string arguments may carry `{{artifact}}` tokens, resolved before it runs. */
function placingArtifacts(tool: OlitTool): OlitTool {
  return {
    ...tool,
    run: async (args: Record<string, unknown>, ctx: Context) => {
      const known = [...ctx.artifacts.prior, ...ctx.artifacts.produced];
      const placed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args)) {
        const { text, refusal } = resolveArtifacts(value, known);
        if (refusal) {
          return fail(`Refused: ${refusal}`);
        }
        placed[key] = text;
      }
      return tool.run(placed, ctx);
    },
  };
}

/** Every tool Olit can offer, before a session filters them by capability. */
export function olitTools(skills = skillRegistry()): OlitTool[] {
  return [
    pythonTool(),
    ...[...opsTools(annotate), ...galaxyTools(), ...visualizationTools()].map(placingArtifacts),
    ...notebookTools(),
    ...gtnTools(),
    ...enaTools(),
    skillsTool(skills),
    ...processTools(),
  ];
}

/** galaxy-ops over the same transport as Olit's own Galaxy client. */
function galaxyOps(options: GalaxyOptions): GalaxyContext {
  return createGalaxyContext({
    baseUrl: options.root,
    apiKey: options.key ?? "",
    fetchImpl: galaxyFetch(options),
  });
}

export class Session {
  /** The session's identity in Galaxy, which its tools may change and each turn reports. */
  readonly binding: Binding;
  private galaxyStatus: GalaxyStatus = GALAXY_UNREACHABLE;
  /** The model connection lives as long as the session: its rate limit spans turns. */
  private connection!: Awaited<ReturnType<typeof connect>>;
  /** Galaxy work this session submitted and has not seen finish. */
  watch: Watch;
  /** Where the running turn hears about a provider retry. */
  private onRetry?: (info: RetryInfo) => void;

  private constructor(
    private config: SessionConfig,
    private galaxy: Galaxy,
    private ops: GalaxyContext,
    private python: Python,
    private target: ReturnType<typeof resolve>,
    private tools: OlitTool[],
  ) {
    this.watch = new Watch(stateReader(galaxy));
    this.binding = {
      sessionId: config.session_id,
      pageId: config.record_page_id,
      historyId: config.history_id,
    };
  }

  static async create(
    config: SessionConfig,
    python: Python,
    env: Record<string, string | undefined> = {},
  ) {
    const target = resolve(config, env);
    if (target.provider.probeWindow && !config.ai_context_window && target.baseUrl) {
      target.contextWindow = (await probeWindow(target.baseUrl)) ?? target.contextWindow;
    }
    const galaxy = connectGalaxy({
      root: config.galaxy_root,
      key: config.galaxy_key,
      credentials: config.credentials,
    });
    const ops = galaxyOps({
      root: galaxy.root,
      key: config.galaxy_key,
      credentials: config.credentials,
    });
    const skills = skillRegistry();
    const session = new Session(config, galaxy, ops, python, target, olitTools(skills));
    session.connection = await connect(target, (info) => session.onRetry?.(info));
    session.galaxyStatus = await galaxy
      .get("api/version")
      .then((): GalaxyStatus => GALAXY_READY)
      .catch((): GalaxyStatus => GALAXY_UNREACHABLE);
    session.context = [
      systemText({
        model: target.model,
        provider: target.provider.id,
        galaxyStatus: session.galaxyStatus,
        seedDataset: config.dataset_id,
        galaxyRoot: galaxy.root,
      }),
      skills.routerText(),
    ]
      .filter(Boolean)
      .join("\n\n");
    return session;
  }

  private context = "";

  get capabilities(): Capability[] {
    return this.config.capabilities ?? DEFAULT_CAPABILITIES;
  }

  /** Point this session at a new turn's context, which names its session and record as given. */
  rebind(config: Partial<SessionConfig>) {
    if (config.session_id !== this.binding.sessionId) {
      // Another conversation: what the last one submitted is the last one's to hear about.
      this.watch = new Watch(stateReader(this.galaxy));
    }
    this.config = { ...this.config, ...config };
    this.binding.sessionId = config.session_id;
    this.binding.pageId = config.record_page_id;
    this.binding.historyId = config.history_id;
  }

  /**
   * One tool, run as a turn would run it but without a model: for a drive that checks a tool's
   * real effect against a real Galaxy. Returns what the model would read and what the shell
   * would receive.
   */
  async call(name: string, args: Record<string, unknown>) {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`no tool named ${name}`);
    }
    const ctx: Context = {
      galaxy: this.galaxy,
      ops: this.ops,
      python: this.python,
      binding: this.binding,
      artifacts: { prior: [], produced: [] },
      watch: this.watch,
    };
    const result = await asAgentTool(tool, () => ctx).execute("call", args as never);
    return { content: contentText(result.content), artifacts: ctx.artifacts.produced };
  }

  /** One pass over the unfinished work: what settled, and the follow-up turn it calls for. */
  async settle(): Promise<{ settled: Settled[]; pending: number; followUp?: string }> {
    const settled = await this.watch.poll();
    return { settled, pending: this.watch.pending, followUp: followUpPrompt(settled) };
  }

  /** The transcript with the context block set and the record excerpt refreshed. */
  private async prepare(transcripts: AgentMessage[]): Promise<AgentMessage[]> {
    const withContext = injectContext(transcripts, this.context);
    const record = await excerpt(this.galaxy, this.binding.pageId, this.binding.historyId);
    return injectRecord(withContext, record);
  }

  /** One turn, prepared here so every caller runs it on the same context. */
  async turn(transcripts: AgentMessage[], options: TurnOptions = {}): Promise<TurnResult> {
    const messages = await this.prepare(transcripts);
    const emit = (event: LoopEvent) => {
      try {
        options.onEvent?.(event);
      } catch {
        // A listener must not break the turn.
      }
    };
    const granted = new Set(this.capabilities);
    const missing = (t: OlitTool) =>
      [t.capability, ...(t.requires ?? [])].find((c) => c !== undefined && !granted.has(c));
    const allowed = (t: OlitTool) => missing(t) === undefined;
    const ctx: Context = {
      galaxy: this.galaxy,
      ops: this.ops,
      python: this.python,
      binding: this.binding,
      artifacts: { prior: options.artifacts ?? [], produced: [] },
      watch: this.watch,
    };
    const galaxyOptions = {
      root: this.galaxy.root,
      key: this.config.galaxy_key,
      credentials: this.config.credentials,
    };
    // Each call gets Galaxy clients bound to its own abort signal, sharing the turn's state.
    const contextFor = (signal?: AbortSignal): Context =>
      signal
        ? {
            ...ctx,
            galaxy: connectGalaxy({ ...galaxyOptions, signal }),
            ops: galaxyOps({ ...galaxyOptions, signal }),
          }
        : ctx;
    const tools = [
      ...this.tools.filter(allowed).map((t) => asAgentTool(t, contextFor)),
      finishTool(),
    ];
    // The resolved key, not the configured one: a headless run reads it from the environment.
    const secrets = [this.target.apiKey, this.config.galaxy_key].filter(
      (s): s is string => typeof s === "string" && s.length >= MIN_SECRET_LENGTH,
    );
    const guard = guards({
      settled: SETTLED,
      watch: this.watch,
      secrets,
      withheld: new Map(this.tools.filter((t) => !allowed(t)).map((t) => [t.name, missing(t)!])),
      advertised: tools.map((t) => t.name),
      destructive: new Set(this.tools.filter((t) => t.destructive).map((t) => t.name)),
      ask: options.ask,
    });
    const logs: string[] = [];
    const { model, streamFn } = this.connection;
    this.onRetry = (info) => {
      logs.push(`provider answered ${info.status}, retrying in ${info.wait}s`);
      emit({ type: "llm_retry", ...info });
    };
    const compaction = compactor(
      compactionSettings({
        enabled: this.config.ai_compaction,
        contextWindow: this.target.contextWindow,
        reserveTokens: this.config.ai_reserve_tokens || this.target.maxTokens,
        keepRecentTokens: this.config.ai_keep_recent_tokens,
      }),
      async (instructions, prompt, signal) => {
        const request = normalizeContext({
          systemPrompt: instructions,
          messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        });
        const stream = await streamFn(model, request, { signal });
        return contentText((await stream.result()).content);
      },
    );
    const maxSteps = this.config.max_steps || MAX_STEPS;
    const produced: AgentMessage[] = [];
    const guardLog: TurnResult["guards"] = [];
    const started = new Map<string, unknown>();
    let steps = 0;
    let exhausted = false;
    let done = false;
    let overflowReported = false;
    let before = JSON.stringify(this.binding);
    let watchedBefore = new Set<string>();

    const agent = new Agent({
      // A message from a caller that does not stamp time (the eval harness) still sorts.
      initialState: { model, tools, messages: messages.map(stamped) },
      streamFn,
      toolExecution: "sequential",
      beforeToolCall: guard.beforeToolCall,
      afterToolCall: guard.afterToolCall,
      convertToLlm: (all) =>
        guard.convert(
          all.filter((m) => ["system", "user", "assistant", "toolResult"].includes(m.role)),
        ) as never,
      transformContext: async (all, signal) => {
        const { messages: compacted, status } = await compaction.compact(all, signal);
        if (status === "compacted") {
          logs.push("compacted the conversation");
          emit({ type: "compacted" });
        } else if (status === "impossible" && !overflowReported) {
          overflowReported = true;
          logs.push("over the context budget with nothing left to compact");
          emit({ type: "context_overflow" });
        }
        return compacted;
      },
      finishTurn: () => {
        steps += 1;
        if (steps >= maxSteps) {
          exhausted = true;
          return { action: "end" };
        }
        return undefined;
      },
    });
    agent.subscribe((event: AgentEvent) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        emit({ type: "text", delta: event.assistantMessageEvent.delta });
      } else if (
        event.type === "message_end" &&
        (event.message.role === "assistant" || event.message.role === "toolResult")
      ) {
        produced.push(event.message);
      } else if (event.type === "tool_execution_start") {
        started.set(event.toolCallId, event.args);
        before = JSON.stringify(this.binding);
        watchedBefore = new Set(this.watch.list().map((w) => `${w.kind}:${w.id}`));
        logs.push(`call ${event.toolName}(${brief(event.args)})`);
        emit({ type: "tool_start", id: event.toolCallId, name: event.toolName });
      } else if (event.type === "tool_execution_end") {
        const content = contentText(event.result.content);
        const notFound = content === `Tool ${event.toolName} not found`;
        const name = event.toolName;
        const guardName =
          guard.guardOf(event.toolCallId, name, notFound) ?? event.result.details?.guard;
        if (event.isError && !(guardName && PRE_DISPATCH.has(guardName))) {
          guard.noteFailure(name, started.get(event.toolCallId) ?? {});
        }
        if (guardName) {
          guardLog.push({ guard: guardName, tool: name });
          logs.push(`  -> refused by the ${guardName} guard`);
        } else {
          logs.push(`  -> ${brief(content)}`);
        }
        done ||= name === "finish" && !event.isError;
        const changed = JSON.stringify(this.binding) !== before;
        const submitted = this.watch.list().filter((w) => !watchedBefore.has(`${w.kind}:${w.id}`));
        emit({
          type: "tool_end",
          id: event.toolCallId,
          name,
          content,
          is_error: event.isError,
          refused: !!guardName,
          guard: guardName,
          ...(changed ? { binding: reported(this.binding) } : {}),
          ...(submitted.length ? { watch: submitted } : {}),
        });
      }
    });
    const abort = () => agent.abort();
    options.signal?.addEventListener("abort", abort);
    try {
      await agent.continue();
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }

    const last = agent.state.messages.at(-1);
    // A stop the user asked for is a stop, however pi labels the request it cut short.
    const aborted =
      !!options.signal?.aborted || (last?.role === "assistant" && last.stopReason === "aborted");
    const failed =
      !aborted && last?.role === "assistant" && last.stopReason === "error"
        ? last.errorMessage
        : undefined;
    if (exhausted) {
      guardLog.push({ guard: "max-steps", steps });
      logs.push(`the step budget of ${maxSteps} was spent before the turn ended`);
    }
    const usage = { input: 0, output: 0, cost: null as number | null };
    for (const m of produced) {
      if (m.role === "assistant") {
        usage.input += m.usage?.input ?? 0;
        usage.output += m.usage?.output ?? 0;
        if (m.usage?.cost?.total) {
          usage.cost = (usage.cost ?? 0) + m.usage.cost.total;
        }
      }
    }
    const kept = produced.filter(
      (m) => !(m.role === "assistant" && (m.stopReason === "error" || m.stopReason === "aborted")),
    );
    const outcome: TurnResult = {
      logs,
      messages: failed
        ? transcripts
        : compaction
            .reduce(agent.state.messages)
            .filter((m) => !(m.role === "assistant" && m.stopReason === "error")),
      new_messages: failed ? [] : kept,
      binding: reported(this.binding),
      watching: this.watch.list(),
      done,
      aborted,
      exhausted,
      artifacts: ctx.artifacts.produced,
      usage,
      steps,
      max_steps: maxSteps,
      guards: guardLog,
      diagnostics: { galaxy: this.galaxyStatus, capabilities: this.capabilities },
    };
    if (failed) {
      outcome.error = { message: failed };
    }
    return outcome;
  }
}
