import type { Context as Chord } from "@earendil-works/chord";
import { contentText, Type, type Message } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  GenerationTask,
  hook,
  LiveDoc,
  section,
  ToolTask,
  type ConversationId,
  type DocumentReader,
  type SubmissionId,
  type Task,
  type ToolExecutionResult,
} from "@earendil-works/pi-durable";

import { Binding } from "./documents";
import type { AskFor } from "./destructive";
import type { Galaxy } from "./galaxy";
import { guards, plainToolName, withoutControlTokens } from "./guards";
import { EMPTY_REPLY } from "./markers";
import { excerpt } from "./notebook";
import {
  durableTool,
  GUARD_COUNTS_AS_FAILURE,
  traitsOf,
  type Artifact,
  type Capability,
  type Context,
  type Guard,
  type OlitTool,
} from "./tool";
import type { Watched } from "./watch";

export const MAX_STEPS = 100;
export const DEFAULT_CAPABILITIES: Capability[] = ["llm", "local", "read", "write"];

export interface OlitHost {
  galaxy: Galaxy;
  /** Galaxy clients and Python for one call, ended by its abort signal. */
  clients(signal: AbortSignal | undefined): Pick<Context, "galaxy" | "web" | "ops" | "python">;
  /** The artifacts earlier results of a conversation carried, newest last. */
  artifacts(conversationId: ConversationId, context: Chord): Promise<Artifact[]>;
  /** Galaxy work a conversation is watching, with the state last read. */
  watched(conversationId: ConversationId, context: Chord): Promise<Watched[]>;
  tools: OlitTool[];
  capabilities: Capability[];
  /** Keys a result must never show. */
  secrets: () => string[];
  /** The standing system prompt for a conversation on this model. */
  prompt: (input: { model?: string; provider?: string; datasetId?: string }) => string;
  ask?: AskFor;
  watch: Task<Watched, any, any, object>;
}

/** What Olit remembers of one run: the guards' counts and the empty-answer retry. */
interface Run {
  id: SubmissionId | undefined;
  guard: ReturnType<typeof guards>;
  /** Whether the last empty answer was already asked again; a tool call since clears it. */
  retried: boolean;
}

const finish = defineTool({
  name: "finish",
  description:
    "Call when the task is complete. The summary is your closing reply to the user: " +
    "state the result itself, not where you wrote it.",
  parameters: Type.Object({ summary: Type.String() }),
  execute: async (args) => ({
    content: [{ type: "text", text: args.summary || "done" }],
    control: { terminate: true },
  }),
});

const codeOf = (result: ToolExecutionResult) =>
  result.diagnostics?.find((d) => d.severity === "error")?.code;

const replaced = (result: ToolExecutionResult, text: string, guard?: Guard) => ({
  ...result,
  content: [{ type: "text" as const, text }],
  diagnostics: (result.diagnostics ?? []).filter((d) => d.severity !== "error"),
  ...(guard ? { details: { refused: true, guard } } : {}),
});

/**
 * A request as Olit sends it: tool names without harmony control tokens, and the record excerpt
 * as an update of its own section just before the last user message.
 */
export function withRecord(messages: readonly Message[], text: string): Message[] {
  const out = messages.map((m) =>
    m.role === "toolResult" && plainToolName(m.toolName) !== m.toolName
      ? { ...m, toolName: plainToolName(m.toolName) }
      : m,
  );
  if (!text) return out;
  const record = { role: "system", content: "", sections: { record: text }, timestamp: Date.now() };
  const at = out.findLastIndex((m) => m.role === "user");
  out.splice(at < 0 ? out.length : at, 0, record as Message);
  return out;
}

/** Olit as a pi-durable extension: its tools, prompt and guards. */
export function olitExtension(host: OlitHost) {
  const granted = new Set(host.capabilities);
  const missing = (t: OlitTool) =>
    [t.capability, ...(t.requires ?? [])].find((c) => c !== undefined && !granted.has(c));
  const offered = host.tools.filter((t) => missing(t) === undefined);
  const withheld = new Map(
    host.tools.flatMap((t) => (missing(t) === undefined ? [] : [[t.name, missing(t)!] as const])),
  );
  const traits = new Map(host.tools.map((t) => [t.name, traitsOf(t)]));
  const advertised = [...offered.map((t) => t.name), finish.name];
  const runs = new Map<ConversationId, Run>();

  /** The memory of the conversation's current run, started afresh when a new run begins. */
  async function runOf(read: DocumentReader, conversationId: ConversationId, context: Chord) {
    const id = (await read.snapshot(LiveDoc, conversationId, context))?.run?.inputs[0];
    const known = runs.get(conversationId);
    if (known && known.id === id) return known;
    const run: Run = {
      id,
      guard: guards({
        tools: traits,
        secrets: host.secrets(),
        withheld,
        advertised,
        ask: host.ask && ((title, message) => host.ask!(title, message, conversationId)),
      }),
      retried: false,
    };
    runs.set(conversationId, run);
    return run;
  }

  /** A result as the model reads it, and what the guards learn from it. */
  function settled(run: Run, call: { id: string; name: string }, result: ToolExecutionResult) {
    const code = codeOf(result);
    let out = result;
    if (code === "tool_unavailable") {
      const hint = run.guard.unoffered(call.name);
      if (hint) out = replaced(result, hint.text, hint.guard);
    } else if (code === "blocked") {
      out = replaced(result, blockedReason(result), run.guard.guardOf(call.id));
    }
    const guard = (out.details as { guard?: Guard } | undefined)?.guard;
    if (out.isError && (!guard || GUARD_COUNTS_AS_FAILURE[guard])) {
      run.guard.noteFailure(call.name, call.id);
    }
    const screened = run.guard.screened(contentText(out.content ?? []));
    return screened === undefined
      ? out
      : { ...out, content: [{ type: "text" as const, text: screened }] };
  }

  const extension = defineExtension({
    name: "olit",
    tools: [...offered.map((t) => durableTool(t, host)), finish],
    sections: [
      section(
        "context",
        async (input, context) =>
          host.prompt({
            model: input.agent.model?.modelId,
            provider: input.agent.model?.provider,
            datasetId: (await input.read.snapshot(Binding, input.conversationId, context))
              ?.datasetId,
          }),
        { tag: false },
      ),
    ],
    tasks: [host.watch],
    hooks: [
      hook(GenerationTask, {
        beforeRequest: async (request, api, context) => {
          // Read for every request, as loom's context hook does: a run's own writes change both.
          // Through the request's own signal, so a Stop ends the reads with the run.
          const bound = await api.snapshot(Binding, api.conversationId, context);
          const { galaxy } = host.clients(context.abortSignal);
          const text = await excerpt(galaxy, bound?.pageId, bound?.historyId);
          return { messages: withRecord(request.messages, text) };
        },
        afterResponse: async (message, api, context) => {
          const calls = message.content.flatMap((c) =>
            c.type === "toolCall" ? [{ id: c.id, name: c.name, arguments: c.arguments }] : [],
          );
          if (!calls.length) return;
          const run = await runOf(api, api.conversationId, context);
          run.guard.observe(calls);
          run.retried = false;
        },
        onYield: async (answer, api, context) => {
          const run = await runOf(api, api.conversationId, context);
          if (contentText(answer.content).trim() || run.retried) return undefined;
          run.retried = true;
          return { continue: EMPTY_REPLY };
        },
      }),
      hook(ToolTask, {
        beforeTool: async (call, api, context) => {
          const run = await runOf(api, api.conversationId, context);
          const reason = await run.guard.check(
            { id: call.id, name: call.name, arguments: call.arguments },
            await host.watched(api.conversationId, context),
          );
          return reason ? { block: reason } : undefined;
        },
        afterTool: async (call, result, api, context) => {
          const out = settled(await runOf(api, api.conversationId, context), call, result);
          return out === result ? undefined : out;
        },
      }),
    ],
  });

  return extension;
}

/** The reason a `beforeTool` block gave, from the diagnostic that carries it. */
function blockedReason(result: ToolExecutionResult): string {
  const message = result.diagnostics?.find((d) => d.code === "blocked")?.message ?? "";
  return withoutControlTokens(message.replace(/^Tool call blocked: /, ""));
}
