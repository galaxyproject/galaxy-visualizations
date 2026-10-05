import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { GalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import type { Galaxy } from "./galaxy";
import { watchedFrom, type Watch } from "./watch";

export type Capability = "llm" | "local" | "read" | "write";

/** Every guard that can refuse a call or end a turn. */
export const GUARDS = [
  "capability",
  "destructive-declined",
  "galaxy-poll",
  "malformed-object-id",
  "max-steps",
  "process-refusal",
  "repeated-failure",
  "settled-question",
  "sra-fan-out",
] as const;

export type Guard = (typeof GUARDS)[number];

/** What a tool reports when the plain result is not the whole story. */
export class Outcome {
  constructor(
    readonly text: string,
    readonly isError = false,
    readonly guard?: Guard,
  ) {}
}

export const fail = (text: string) => new Outcome(text, true);

export interface Artifact {
  kind: string;
  title?: string;
  [key: string]: unknown;
}

export interface Python {
  /** An abort ends the run and the realm with it; the next call starts afresh. */
  run(code: string, signal?: AbortSignal): Promise<string>;
  write(path: string, data: Uint8Array): Promise<void>;
  read(path: string): Promise<Uint8Array | undefined>;
}

/** The session's identity in Galaxy: its id, its record page, the history it works in. */
export interface Binding {
  sessionId?: string;
  pageId?: string;
  historyId?: string;
}

export interface Context {
  galaxy: Galaxy;
  ops: GalaxyContext;
  python: Python;
  /** What this session is bound to; the session owns it and reports its changes. */
  binding: Binding;
  /** Earlier turns' artifacts and this turn's, which a page may place. */
  artifacts: { prior: Artifact[]; produced: Artifact[] };
  /** The session's unfinished Galaxy work; a tool that submits some registers it here. */
  watch: Watch;
}

export interface Details {
  refused?: boolean;
  guard?: Guard;
}

export interface OlitTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  capability?: Capability;
  /** Deletes or cancels something that cannot be brought back: the user is asked first. */
  destructive?: boolean;
  /** Destroys for these arguments only, as galaxy-ops' destructiveWhen says. */
  destructiveWhen?: (args: Record<string, unknown>) => boolean;
  /** The argument naming something that moves on its own: reading it again soon says nothing new. */
  polls?: string;
  /** The same arguments answer the same for the rest of the session. */
  settled?: boolean;
  /** Every capability the tool needs, when it is more than `capability` alone. */
  requires?: Capability[];
  run(args: any, ctx: Context): Promise<unknown>;
}

/** What the guards need to know of a tool, read off the tool rather than kept in lists. */
export interface ToolTraits {
  settled: boolean;
  polls?: string;
  destroys: (args: Record<string, unknown>) => boolean;
}

export const traitsOf = (tool: OlitTool): ToolTraits => ({
  settled: tool.settled === true,
  polls: tool.polls,
  destroys: (args) => tool.destructive === true || tool.destructiveWhen?.(args) === true,
});

/** A Galaxy result as the model reads it: the envelope's non-empty payload fields. */
export function rendered(envelope: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const key of ["data", "message", "pagination"]) {
    if (envelope[key] !== undefined && envelope[key] !== null) {
      out[key] = envelope[key];
    }
  }
  return JSON.stringify(out);
}

export function result(
  text: string,
  isError = false,
  details: Details = {},
): AgentToolResult<Details> {
  return { content: [{ type: "text", text }], details, isError };
}

/** Route an artifact to the shell, leaving its kind and title in the result. */
export function claim(value: unknown, ctx: Context, hint?: string): unknown {
  const artifact = (value as { artifact?: Artifact } | null)?.artifact;
  if (!artifact || typeof artifact !== "object") {
    return value;
  }
  ctx.artifacts.produced.push(artifact);
  return {
    ...(value as object),
    artifact: { kind: artifact.kind, title: artifact.title },
    ...(hint ? { hint } : {}),
  };
}

/** A tool for pi. `contextFor` gives the call a context whose requests end when pi aborts it. */
export function asAgentTool(
  tool: OlitTool,
  contextFor: (signal?: AbortSignal) => Context,
): AgentTool {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as AgentTool["parameters"],
    execute: async (_id, args, signal) => {
      const ctx = contextFor(signal);
      let value: unknown;
      try {
        value = await tool.run(args, ctx);
      } catch (err) {
        return result(`Tool '${tool.name}' raised: ${(err as Error)?.message ?? err}`, true);
      }
      if (!(value instanceof Outcome)) {
        ctx.watch.add(watchedFrom(tool.name, value));
      }
      // Writing into a history is choosing it: an unbound session works there from now on.
      const named = (args as { history_id?: unknown }).history_id;
      const wrote = tool.capability === "write" && !(value instanceof Outcome && value.isError);
      if (wrote && typeof named === "string" && !ctx.binding.historyId) {
        ctx.binding.historyId = named;
      }
      if (value instanceof Outcome) {
        return result(
          value.text,
          value.isError,
          value.guard ? { refused: true, guard: value.guard } : {},
        );
      }
      return result(typeof value === "string" ? value : rendered({ data: claim(value, ctx) }));
    },
  };
}
