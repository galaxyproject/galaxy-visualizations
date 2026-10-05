import { z } from "zod";
import {
  allOperations,
  describeOperation,
  runWithEnvelope,
  spellParamNames,
  type AnyOperation,
} from "@galaxyproject/galaxy-ops/browser";

import SNAPSHOT from "./galaxy-mcp-docs.json";
import { fail, Outcome, rendered, type Context, type OlitTool } from "./tool";
import { watchedFrom } from "./watch";

export const snake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** What Olit adds to a Galaxy result before the model reads it. */
export type Annotate = (
  name: string,
  args: Record<string, unknown>,
  data: unknown,
  ctx: Context,
) => Promise<string | undefined>;

/**
 * What galaxy-mcp tells a model about a tool, captured from its source by
 * scripts/capture_galaxy_mcp_docs.py and never edited here: Orbit's model reads the same text.
 */
export const UPSTREAM_DOCS = SNAPSHOT.docs as Record<string, string>;

/** What Olit layers on a galaxy-ops operation it does not own: policy, not behaviour. */
export interface OpPolicy {
  /** Olit's refusal before the operation runs, or undefined to let it run. */
  check?: (args: Record<string, unknown>, ctx: Context) => Promise<Outcome | undefined>;
  /** Runs the call, for a queue the call has to wait its turn in. */
  around?: <T>(call: () => Promise<T>) => Promise<T>;
  /** Olit's own answer to a refusal, when its policy has something to add to the message. */
  refused?: (message: string, args: Record<string, unknown>) => Outcome | undefined;
  destructiveWhen?: (args: Record<string, unknown>) => boolean;
  polls?: string;
  settled?: boolean;
}

/** galaxy-ops operations under galaxy-mcp's names: snake_case at the top level, its docstrings. */
export function opsTools(annotate?: Annotate, policies: Record<string, OpPolicy> = {}): OlitTool[] {
  return allOperations.map((op) => opsTool(op, annotate, policies[op.name] ?? {}));
}

/** The model's snake_case arguments under the names galaxy-ops' input takes. */
const inputOf = (args: Record<string, unknown>, toInput: Map<string, string>) =>
  Object.fromEntries(Object.entries(args).map(([k, v]) => [toInput.get(k) ?? k, v]));

function opsTool(op: AnyOperation, annotate: Annotate | undefined, policy: OpPolicy): OlitTool {
  const schema = z.toJSONSchema(z.strictObject(op.input), { io: "input" }) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const toInput = new Map(Object.keys(op.input).map((key) => [snake(key), key]));
  return {
    name: op.name,
    // galaxy-ops' own line, in snake_case, for an operation galaxy-mcp has not documented.
    description: UPSTREAM_DOCS[op.name] ?? spellParamNames(describeOperation(op), op.input, snake),
    capability: op.readOnly === false ? "write" : "read",
    destructive: op.destructive === true && !policy.destructiveWhen,
    destructiveWhen: policy.destructiveWhen,
    polls: policy.polls,
    settled: policy.settled === true,
    parameters: {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([k, v]) => [snake(k), v]),
      ),
      required: schema.required?.map(snake),
    },
    run: async (args: Record<string, unknown>, ctx: Context) => {
      const refused = await policy.check?.(args, ctx);
      if (refused) {
        return refused;
      }
      const input = inputOf(args, toInput);
      const call = () => runWithEnvelope(op, input as never, ctx.ops);
      const envelope = (await (policy.around ? policy.around(call) : call())) as unknown as Record<
        string,
        unknown
      >;
      if (!envelope.success) {
        const message = String(envelope.message || `${op.name} failed`);
        return policy.refused?.(message, args) ?? fail(message);
      }
      ctx.watch.add(watchedFrom(op.name, envelope.data));
      // Creating a history is the agent choosing where to work, even in a bound session.
      const created = (envelope.data as { id?: unknown } | undefined)?.id;
      if (op.name === "create_history" && typeof created === "string") {
        ctx.binding.historyId = created;
      }
      const payload = rendered(envelope);
      const hint = await annotate?.(op.name, args, envelope.data, ctx);
      return new Outcome(hint ? `${payload}\n\n${hint}` : payload);
    },
  };
}
