import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import { normalizeContext } from "@earendil-works/pi-ai";
import { createGalaxyContext, type GalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import { resolveArtifacts } from "./artifacts";
import { compactionSettings, compactor } from "./compaction";
import type { Ask } from "./destructive";
import { connectGalaxy, galaxyFetch, type Galaxy } from "./galaxy";
import { annotate, galaxyTools, SETTLED } from "./galaxy-tools";
import { enaTools } from "./ena";
import { gtnTools } from "./gtn";
import { guards, textOf } from "./guards";
import { fromPi, toPi, type Message } from "./messages";
import { connect } from "./model";
import { excerpt, notebookTools } from "./notebook";
import { opsTools } from "./ops";
import { processTools } from "./processes";
import { GALAXY_READY, GALAXY_UNREACHABLE, systemText, type GalaxyStatus } from "./prompt";
import { probeWindow, resolve, type LlmConfig } from "./providers";
import { skillRegistry, skillsTool } from "./skills";
import {
  asAgentTool,
  fail,
  result,
  type Artifact,
  type Guard,
  type Capability,
  type Context,
  type OlitTool,
  type Python,
  type Watched,
} from "./tool";
import { pythonTool } from "./python";
import { visualizationTools } from "./visualizations";

export const MAX_STEPS = 100;
const DEFAULT_CAPABILITIES: Capability[] = ["llm", "local", "read", "write"];
const BEGIN = "<!-- olit:context -->";
const END = "<!-- /olit:context -->";
const RECORD_MARKER = "<!-- olit:record -->";
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
    }
  | { type: "llm_retry"; status: number; wait: number; attempt: number; of: number }
  | { type: "compacted" }
  | { type: "context_overflow" };

export interface TurnOptions {
  onEvent?: (event: LoopEvent) => void;
  artifacts?: Artifact[];
  watching?: Watched[];
  /** Present when a user can approve a destructive operation. */
  ask?: Ask;
  signal?: AbortSignal;
}

export interface TurnResult {
  logs: string[];
  messages: Message[];
  new_messages: Message[];
  done: boolean;
  aborted: boolean;
  exhausted: boolean;
  artifacts: Artifact[];
  usage: { input: number; output: number; cost: number | null };
  steps: number;
  max_steps: number;
  guards: Array<{ guard: Guard; tool?: string; steps?: number }>;
  diagnostics: { galaxy: GalaxyStatus; capabilities: Capability[] };
  error?: { message: string };
}

const brief = (value: unknown, limit = 300) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
};

/** A turn that could not run, as a result rather than an exception. */
export function failedTurn(transcripts: Message[], err: unknown): TurnResult {
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
    diagnostics: { galaxy: GALAXY_UNREACHABLE, capabilities: [] },
    error: { message: String((err as Error)?.message ?? err) },
  };
}

/** The brain's context block in the system message, replacing an earlier copy. */
export function injectContext(transcripts: Message[], text: string): Message[] {
  if (!text || !transcripts.length) {
    return transcripts;
  }
  const block = `${BEGIN}\n${text}\n${END}`;
  const [first, ...rest] = transcripts;
  if (first.role !== "system") {
    return [{ role: "system", content: block }, ...transcripts];
  }
  let content = first.content ?? "";
  const start = content.indexOf(BEGIN);
  const stop = content.indexOf(END);
  content =
    start !== -1 && stop > start
      ? content.slice(0, start) + block + content.slice(stop + END.length)
      : `${content}\n\n${block}`;
  return [{ ...first, content: content.trim() }, ...rest];
}

/** The record excerpt as its own message just before the last user turn, replacing an earlier copy. */
export function injectRecord(transcripts: Message[], text: string | undefined): Message[] {
  const kept = transcripts.filter((m) => !(m.content ?? "").includes(RECORD_MARKER));
  if (!text) {
    return kept;
  }
  const message: Message = { role: "system", content: `${RECORD_MARKER}\n${text}` };
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

export class Session {
  readonly record: { sessionId?: string; pageId?: string };
  private galaxyStatus: GalaxyStatus = GALAXY_UNREACHABLE;

  private constructor(
    private config: SessionConfig,
    private galaxy: Galaxy,
    private ops: GalaxyContext,
    private python: Python,
    private target: ReturnType<typeof resolve>,
    private tools: OlitTool[],
  ) {
    this.record = { sessionId: config.session_id, pageId: config.record_page_id };
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
    const ops = createGalaxyContext({
      baseUrl: galaxy.root,
      apiKey: config.galaxy_key ?? "",
      fetchImpl: galaxyFetch({
        root: galaxy.root,
        key: config.galaxy_key,
        credentials: config.credentials,
      }),
    });
    const skills = skillRegistry();
    const session = new Session(config, galaxy, ops, python, target, olitTools(skills));
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

  /** Point this session at a new turn's context. */
  rebind(config: Partial<SessionConfig>) {
    this.config = { ...this.config, ...config };
    this.record.sessionId = config.session_id || this.record.sessionId;
    this.record.pageId = config.record_page_id || this.record.pageId;
  }

  /** The transcript with the context block set and the record excerpt refreshed. */
  async prepare(
    transcripts: Message[],
    recordPageId?: string,
    historyId?: string,
  ): Promise<Message[]> {
    const withContext = injectContext(transcripts, this.context);
    return injectRecord(withContext, await excerpt(this.galaxy, recordPageId, historyId));
  }

  async turn(messages: Message[], options: TurnOptions = {}): Promise<TurnResult> {
    const emit = (event: LoopEvent) => {
      try {
        options.onEvent?.(event);
      } catch {
        // A listener must not break the turn.
      }
    };
    const granted = new Set(this.capabilities);
    const allowed = (t: OlitTool) => !t.capability || granted.has(t.capability);
    const ctx: Context = {
      galaxy: this.galaxy,
      ops: this.ops,
      python: this.python,
      record: this.record,
      artifacts: { prior: options.artifacts ?? [], produced: [] },
      watching: options.watching ?? [],
    };
    const tools = [...this.tools.filter(allowed).map((t) => asAgentTool(t, ctx)), finishTool()];
    const secrets = [this.config.ai_api_key, this.config.galaxy_key].filter(
      (s): s is string => typeof s === "string" && s.length >= MIN_SECRET_LENGTH,
    );
    const guard = guards({
      settled: SETTLED,
      watching: ctx.watching,
      secrets,
      withheld: new Map(this.tools.filter((t) => !allowed(t)).map((t) => [t.name, t.capability!])),
      advertised: tools.map((t) => t.name),
      ask: options.ask,
    });
    const logs: string[] = [];
    const { model, streamFn } = connect(this.target, (info) => {
      logs.push(`provider answered ${info.status}, retrying in ${info.wait}s`);
      emit({ type: "llm_retry", ...info });
    });
    const compaction = compactor(
      compactionSettings({
        enabled: this.config.ai_compaction,
        contextWindow: this.target.contextWindow,
        reserveTokens: this.config.ai_reserve_tokens || this.target.maxTokens,
        keepRecentTokens: this.config.ai_keep_recent_tokens,
      }),
      async (system, prompt, signal) => {
        const request = normalizeContext({
          systemPrompt: system,
          messages: toPi([{ role: "user", content: prompt }]) as never,
        });
        const stream = await streamFn(model, request, { signal });
        return textOf((await stream.result()).content as Array<{ type: string; text?: string }>);
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

    const agent = new Agent({
      initialState: { model, tools, messages: toPi(messages) },
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
        logs.push(`call ${event.toolName}(${brief(event.args)})`);
        emit({ type: "tool_start", id: event.toolCallId, name: event.toolName });
      } else if (event.type === "tool_execution_end") {
        const content = textOf(event.result.content);
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
        emit({
          type: "tool_end",
          id: event.toolCallId,
          name,
          content,
          is_error: event.isError,
          refused: !!guardName,
          guard: guardName,
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
    const aborted = last?.role === "assistant" && last.stopReason === "aborted";
    const failed =
      last?.role === "assistant" && last.stopReason === "error" ? last.errorMessage : undefined;
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
        ? messages
        : fromPi(
            compaction
              .reduce(agent.state.messages)
              .filter((m) => !(m.role === "assistant" && m.stopReason === "error")),
          ),
      new_messages: failed ? [] : fromPi(kept),
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
