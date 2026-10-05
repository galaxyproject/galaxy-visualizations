import { quote } from "../quote";
import { claim, Outcome, type Capability, type OlitTool } from "../tool";
import { lineageReport } from "./lineage-report";
import { organizeDatasets } from "./organize-datasets";
import { type Process } from "./process";

export type { Process } from "./process";

export const PROCESSES: Process[] = [lineageReport, organizeDatasets];

export const ARTIFACT_HINT =
  "This artifact is already displayed to the user and is not a history dataset, " +
  "so do not look for it there. Keeping it means writing {{artifact}} into a page " +
  "where it belongs; that token is the only way to place it, since its content is " +
  "held outside your context. Describe what it shows and finish.";

const STRENGTH: Capability[] = ["llm", "local", "read", "write"];

/** The strongest capability a process declares. */
function strongest(capabilities: Capability[]): Capability | undefined {
  return STRENGTH.findLast((c) => capabilities.includes(c));
}

/** The tool's JSON schema, read from the process's declared inputs. */
function parameters(process: Process) {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(process.inputs)) {
    properties[key] =
      spec.type === "array" ? { type: "array", items: { type: "string" } } : { type: spec.type };
    const described = [
      ...(spec.help ? [spec.help] : []),
      ...(spec.default !== undefined ? [`Defaults to ${quote(spec.default)}.`] : []),
    ];
    if (described.length) {
      properties[key].description = described.join(" ");
    }
    if (spec.required) {
      required.push(key);
    }
  }
  return { type: "object", properties, required };
}

function withDefaults(process: Process, args: Record<string, unknown> = {}) {
  const out = { ...args };
  for (const [key, spec] of Object.entries(process.inputs)) {
    if (out[key] === undefined && spec.default !== undefined) {
      out[key] = spec.default;
    }
  }
  return out;
}

/** One tool per process, named after it. */
export function processTools(processes: Process[] = PROCESSES): OlitTool[] {
  return [...processes]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((process) => ({
      name: process.name,
      description: process.whenToUse
        ? `${process.description} Use ${process.whenToUse}.`
        : process.description,
      parameters: parameters(process),
      capability: strongest(process.capabilities),
      // A process runs only when the grant covers everything it declares, not just the top.
      requires: process.capabilities,
      run: async (args, ctx) => {
        const state = await process.run(ctx.galaxy, withDefaults(process, args));
        const summary = process.summarize?.(state);
        if (summary?.ok === false) {
          return new Outcome(JSON.stringify(summary), true, "process-refusal");
        }
        if (summary && Object.keys(summary).length) {
          return new Outcome(JSON.stringify(summary));
        }
        // A renderable artifact goes to the shell out of band, not into the context.
        const claimed = claim(state, ctx, ARTIFACT_HINT);
        return new Outcome(
          JSON.stringify(claimed === state ? state : { ...(claimed as object), ok: true }),
        );
      },
    }));
}
