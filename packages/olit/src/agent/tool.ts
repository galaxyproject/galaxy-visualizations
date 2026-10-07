import { Type } from "@earendil-works/pi-ai";
import type { Context as Chord, JsonValue } from "@earendil-works/chord";
import {
  defineTool,
  type ConversationId,
  type JsonObject,
  type Task,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import type { GalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import type { Artifact } from "../artifacts/kinds";
import { Binding as Bound } from "./documents";
import type { Galaxy } from "./galaxy";
import { isTerminal, watchedFrom, type Watched } from "./watch";

export type { Artifact } from "../artifacts/kinds";

export type Capability = "llm" | "local" | "read" | "write";

/**
 * Every guard that can refuse a call or end a turn, and whether its refusal counts as a failure
 * of the call's arguments: one refused before the call ran, or declined by the user, says nothing
 * about them, so it must not bring on the repeated-failure guard.
 */
export const GUARD_COUNTS_AS_FAILURE = {
  capability: true,
  "destructive-declined": false,
  "galaxy-poll": false,
  "malformed-object-id": true,
  "process-refusal": true,
  "repeated-failure": false,
  "settled-question": false,
  "sra-fan-out": false,
} as const;

export type Guard = keyof typeof GUARD_COUNTS_AS_FAILURE;

export const GUARDS = Object.keys(GUARD_COUNTS_AS_FAILURE) as Guard[];

/** What a tool reports when the plain result is not the whole story. */
export class Outcome {
  constructor(
    readonly text: string,
    readonly isError = false,
    readonly guard?: Guard,
  ) {}
}

export const fail = (text: string) => new Outcome(text, true);

export interface Python {
  /** An abort ends the run and the realm with it; the next call starts afresh. */
  run(code: string, signal?: AbortSignal): Promise<string>;
  write(path: string, data: Uint8Array): Promise<void>;
  read(path: string): Promise<Uint8Array | undefined>;
}

/** The conversation's identity in Galaxy: its id, its record page, the history it works in. */
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
  /** Galaxy work a tool submitted, watched once the call returns. */
  watch: { add(items: Watched[]): void };
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

/** What a durable tool needs from its host besides the conversation's binding. */
export interface ToolHost {
  /** Galaxy clients and Python for one call, ended by its abort signal. */
  clients(signal: AbortSignal | undefined): Pick<Context, "galaxy" | "ops" | "python">;
  /** The artifacts earlier results carried, newest last. */
  artifacts(conversationId: ConversationId, context: Chord): Promise<Artifact[]>;
  watch: Task<Watched, any, JsonValue, object>;
}

/** What a result carries beside its text: the artifacts it made, the guard that refused it. */
export interface Details {
  artifacts?: Artifact[];
  refused?: boolean;
  guard?: Guard;
}

/**
 * An Olit tool as a pi-durable tool. A read runs again after a reload; a write does not, so a
 * Galaxy effect is never repeated: the work it submitted is watched from the commit that records
 * the binding it changed. Artifacts travel in the result's details.
 */
export function durableTool(tool: OlitTool, host: ToolHost): ToolRegistration {
  return defineTool({
    name: tool.name,
    description: tool.description,
    parameters: Type.Unsafe(tool.parameters),
    ...(tool.capability === "write" ? {} : { replay: "safe" as const }),
    execute: async (args, api, context) => {
      const id = api.conversationId;
      const [bound, prior] = await Promise.all([
        api.snapshot(Bound, id, context),
        host.artifacts(id, context),
      ]);
      const before = JSON.stringify(bound ?? {});
      const submitted: Watched[] = [];
      const ctx: Context = {
        ...host.clients(context.abortSignal),
        binding: { ...(bound ?? {}) },
        artifacts: { prior, produced: [] },
        watch: { add: (items) => submitted.push(...items) },
      };
      let value: unknown;
      try {
        value = await tool.run(args, ctx);
      } catch (err) {
        value = fail(`Tool '${tool.name}' raised: ${(err as Error)?.message ?? err}`);
      }
      if (!(value instanceof Outcome)) {
        submitted.push(...watchedFrom(tool.name, value));
      }
      const named = (args as { history_id?: unknown }).history_id;
      const wrote = tool.capability === "write" && !(value instanceof Outcome && value.isError);
      if (wrote && typeof named === "string" && !ctx.binding.historyId) {
        ctx.binding.historyId = named;
      }
      const text =
        value instanceof Outcome
          ? value.text
          : typeof value === "string"
            ? value
            : rendered({ data: claim(value, ctx) });
      const rebound = JSON.stringify(ctx.binding) !== before;
      const watched = submitted.filter((w) => !isTerminal(w.kind, w.state));
      if (rebound || watched.length) {
        await api.commit(async (tx) => {
          if (rebound) {
            Object.assign(await tx.doc(Bound, id), ctx.binding);
          }
          for (const w of watched) {
            await tx.createTask(host.watch, w, {
              ownership: { kind: "conversation" },
              conversationId: id,
              background: true,
            });
          }
        }, context);
      }
      const guard = value instanceof Outcome ? value.guard : undefined;
      const details: Details = {
        ...(ctx.artifacts.produced.length ? { artifacts: ctx.artifacts.produced } : {}),
        ...(guard ? { refused: true, guard } : {}),
      };
      return {
        content: [{ type: "text", text }],
        isError: value instanceof Outcome && value.isError,
        ...(Object.keys(details).length ? { details: details as JsonObject } : {}),
      };
    },
  });
}
