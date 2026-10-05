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

/** Operations Olit runs itself rather than through galaxy-ops. */
export const OLIT_OWNED = new Set([
  "get_history_contents",
  "get_invocations",
  "get_job_details",
  "get_page",
  "run_tool",
  "update_page",
  "upload_file_from_url",
]);

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

/** galaxy-ops operations under galaxy-mcp's names: snake_case at the top level, its docstrings. */
export function opsTools(annotate?: Annotate): OlitTool[] {
  return allOperations.filter((op) => !OLIT_OWNED.has(op.name)).map((op) => opsTool(op, annotate));
}

function opsTool(op: AnyOperation, annotate?: Annotate): OlitTool {
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
    destructive: op.destructive === true,
    parameters: {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([k, v]) => [snake(k), v]),
      ),
      required: schema.required?.map(snake),
    },
    run: async (args: Record<string, unknown>, ctx: Context) => {
      const input = Object.fromEntries(
        Object.entries(args).map(([k, v]) => [toInput.get(k) ?? k, v]),
      );
      const envelope = (await runWithEnvelope(op, input as never, ctx.ops)) as unknown as Record<
        string,
        unknown
      >;
      if (!envelope.success) {
        return fail(String(envelope.message || `${op.name} failed`));
      }
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
