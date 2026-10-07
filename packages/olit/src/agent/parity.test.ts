import { GALAXY_MCP_SURFACE } from "@galaxyproject/galaxy-ops/browser";
import { describe, expect, it } from "vitest";

import { galaxyTools, OPS_POLICY } from "./galaxy-tools";
import { CATALOG_SEARCHES, IWC_LISTINGS } from "./hints";
import { opsTools } from "./ops";
import { WATCHED_TOOLS } from "./watch";

const params = (tool: { parameters: Record<string, unknown> }) =>
  Object.keys((tool.parameters as { properties?: object }).properties ?? {}).sort();

/** Tools Olit runs on the browser's in-memory filesystem, which galaxy-mcp runs on disk. */
const LOCAL = new Set(["download_dataset", "upload_file"]);

describe("the Galaxy tool surface against galaxy-mcp", () => {
  // Olit's own tools keep galaxy-mcp's names and parameters, so a model told about galaxy-mcp's
  // tools can call them: a parameter it documents and Olit drops is one the model cannot pass.
  it("takes galaxy-mcp's parameters for every tool Olit runs itself", () => {
    for (const tool of galaxyTools()) {
      if (tool.name in GALAXY_MCP_SURFACE && !LOCAL.has(tool.name)) {
        expect(params(tool), tool.name).toEqual(
          Object.keys(GALAXY_MCP_SURFACE[tool.name]!.parameters).sort(),
        );
      }
    }
  });

  it("describes each galaxy-ops operation as galaxy-mcp advertises it, parameters included", () => {
    for (const tool of opsTools()) {
      const advertised = GALAXY_MCP_SURFACE[tool.name]!;
      expect(tool.description, tool.name).toBe(advertised.description);
      const properties = (
        tool.parameters as { properties: Record<string, { description?: string }> }
      ).properties;
      for (const [name, said] of Object.entries(advertised.parameters)) {
        if (said) expect(properties[name]?.description, `${tool.name}.${name}`).toBe(said);
      }
    }
  });

  it("offers each name once: a galaxy-ops operation and an Olit tool never share one", () => {
    const names = [...opsTools(), ...galaxyTools()].map((t) => t.name);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it("offers every galaxy-mcp tool except the connection, which Olit's session already has", () => {
    const offered = new Set([...opsTools(), ...galaxyTools()].map((t) => t.name));
    const missing = Object.keys(GALAXY_MCP_SURFACE).filter((name) => !offered.has(name));
    expect(missing).toEqual(["connect"]);
  });

  it("keys every rule Olit adds to an operation on a name the tool surface still offers", () => {
    const offered = new Set([...opsTools(), ...galaxyTools()].map((t) => t.name));
    const keyed = [
      ...Object.keys(OPS_POLICY),
      ...WATCHED_TOOLS,
      ...IWC_LISTINGS,
      ...CATALOG_SEARCHES,
      "get_invocations",
    ];
    expect(keyed.filter((name) => !offered.has(name))).toEqual([]);
  });
});
