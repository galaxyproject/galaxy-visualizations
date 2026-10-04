import { z } from "zod";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  allOperations,
  describeOperation,
  runWithEnvelope,
  spellParamNames,
  type AnyOperation,
  type GalaxyContext,
} from "@galaxyproject/galaxy-ops/browser";

/** Operations Olit runs itself rather than through galaxy-ops. */
const OLIT_OWNED = new Set([
  "get_history_contents",
  "get_invocations",
  "get_job_details",
  "get_page",
  "run_tool",
  "update_page",
  "upload_file_from_url",
]);

const snake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const text = (value: string, isError = false): AgentToolResult<undefined> => ({
  content: [{ type: "text", text: value }],
  details: undefined,
  isError,
});

/** galaxy-ops operations as agent tools, with top-level parameters in galaxy-mcp's snake_case. */
export function galaxyTools(ctx: GalaxyContext): AgentTool[] {
  return allOperations.filter((op) => !OLIT_OWNED.has(op.name)).map((op) => galaxyTool(op, ctx));
}

function galaxyTool(op: AnyOperation, ctx: GalaxyContext): AgentTool {
  const spell = (value: string) => spellParamNames(value, op.input, snake);
  const schema = z.toJSONSchema(z.strictObject(op.input), { io: "input" }) as {
    properties?: Record<string, { description?: string }>;
    required?: string[];
  };
  const toInput = new Map(Object.keys(op.input).map((key) => [snake(key), key]));
  const properties = Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([key, value]) => [
      snake(key),
      value.description ? { ...value, description: spell(value.description) } : value,
    ]),
  );
  return {
    name: op.name,
    label: op.name,
    description: spell(describeOperation(op)),
    parameters: {
      ...schema,
      properties,
      required: schema.required?.map(snake),
    } as unknown as AgentTool["parameters"],
    execute: async (_id, args) => {
      const input = Object.fromEntries(
        Object.entries(args as Record<string, unknown>).map(([key, value]) => [
          toInput.get(key) ?? key,
          value,
        ]),
      );
      const result = await runWithEnvelope(op, input as never, ctx);
      return text(JSON.stringify(result), !result.success);
    },
  };
}

export function runPythonTool(run: (code: string) => Promise<string>): AgentTool {
  return {
    name: "run_python",
    label: "run_python",
    description:
      "Run Python locally in the browser (Pyodide). numpy and pandas are available; state persists " +
      "across calls. Returns the last expression value and stdout. Top-level `await` works, and " +
      "`pyfetch(url)` performs a browser fetch, so an HTTP API can be read directly - but only from " +
      "hosts that send CORS headers. This runs in the browser, NOT on Galaxy - it cannot import " +
      "galaxy, and real compute belongs in a Galaxy job.",
    parameters: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    } as unknown as AgentTool["parameters"],
    executionMode: "sequential",
    execute: async (_id, args) => text(await run((args as { code: string }).code)),
  };
}
