import { createGalaxyContext, type GalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import { resolveArtifacts } from "./artifacts";
import { enaTools } from "./ena";
import { galaxyFetch, type GalaxyOptions } from "./galaxy";
import { annotate, galaxyTools, OPS_POLICY } from "./galaxy-tools";
import { gtnTools } from "./gtn";
import { notebookTools } from "./notebook";
import { opsTools } from "./ops";
import { processTools } from "./processes";
import { pythonTool } from "./python";
import { skillRegistry, skillsTool } from "./skills";
import { fail, type Context, type OlitTool } from "./tool";
import { visualizationTools } from "./visualizations";

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
  const python = pythonTool();
  const visualizations = visualizationTools();
  const rest = [
    ...notebookTools(),
    ...gtnTools(),
    ...enaTools(),
    skillsTool(skills),
    ...processTools(),
  ];
  const own = new Set([python, ...visualizations, ...rest].map((t) => t.name));
  const galaxy = [...opsTools(annotate, OPS_POLICY), ...galaxyTools()].map((t) =>
    misrouted(t, own),
  );
  return [python, ...[...galaxy, ...visualizations].map(placingArtifacts), ...rest];
}

/**
 * A Galaxy tool asked about one of Olit's own tools: Galaxy answers "not found", or nothing at
 * all, so say where the tool lives instead. A tool_id asks for it directly; a query hunts the
 * catalog for it.
 */
function misrouted(tool: OlitTool, own: Set<string>): OlitTool {
  return {
    ...tool,
    run: async (args: Record<string, unknown>, ctx: Context) => {
      const wanted = [args.tool_id, args.query].find(
        (v): v is string => typeof v === "string" && own.has(v.trim()),
      );
      if (wanted && wanted === args.tool_id) {
        return fail(`'${wanted}' is an Olit tool, not a Galaxy tool. Call ${wanted} directly.`);
      }
      if (wanted) {
        return fail(
          `'${wanted}' is an Olit tool rather than a Galaxy tool, so the tool catalog does not ` +
            "hold it. It is already in your tool list if you need it.",
        );
      }
      return tool.run(args, ctx);
    },
  };
}

/** galaxy-ops over the same transport as Olit's own Galaxy client. */
export function galaxyOps(options: GalaxyOptions): GalaxyContext {
  return createGalaxyContext({
    baseUrl: options.root,
    apiKey: options.key ?? "",
    fetchImpl: galaxyFetch(options),
  });
}
