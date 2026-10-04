import { z } from "zod";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  allOperations,
  describeOperation,
  runWithEnvelope,
  type GalaxyContext,
} from "@galaxyproject/galaxy-ops/browser";

const text = (value: string, isError = false): AgentToolResult<undefined> => ({
  content: [{ type: "text", text: value }],
  details: undefined,
  isError,
});

/** galaxy-ops' read-only operations as agent tools. */
export function galaxyTools(ctx: GalaxyContext): AgentTool[] {
  return allOperations
    .filter((op) => op.readOnly !== false)
    .map((op) => ({
      name: op.name,
      label: op.name,
      description: describeOperation(op),
      parameters: z.toJSONSchema(z.object(op.input), { io: "input" }) as AgentTool["parameters"],
      execute: async (_id, args) => {
        const result = await runWithEnvelope(op, args as never, ctx);
        return text(JSON.stringify(result), !result.success);
      },
    }));
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
