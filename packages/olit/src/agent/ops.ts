import { z } from "zod";
import {
  allOperations,
  runWithEnvelope,
  type AnyOperation,
} from "@galaxyproject/galaxy-ops/browser";

import DOCS from "./tool-docs.json";
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
    description: (DOCS as Record<string, string>)[op.name] ?? op.summary,
    capability: op.readOnly === false ? "write" : "read",
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
      const payload = rendered(envelope);
      const hint = await annotate?.(op.name, args, envelope.data, ctx);
      return new Outcome(hint ? `${payload}\n\n${hint}` : payload);
    },
  };
}
