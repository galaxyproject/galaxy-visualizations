import { describe, expect, it } from "vitest";

import { galaxyTools, OPS_POLICY } from "./galaxy-tools";
import { CATALOG_SEARCHES, IWC_LISTINGS } from "./hints";
import SNAPSHOT from "./galaxy-mcp-docs.json";
import { opsTools } from "./ops";
import { WATCHED_TOOLS } from "./watch";

/** galaxy-mcp's Python signatures and docstrings, captured from its source. */
const UPSTREAM = SNAPSHOT.params as Record<string, string[]>;
const DOCS = SNAPSHOT.docs as Record<string, string>;
const params = (tool: { parameters: Record<string, unknown> }) =>
  Object.keys((tool.parameters as { properties?: object }).properties ?? {}).sort();

/** Tools Olit runs on the browser's in-memory filesystem, which galaxy-mcp runs on disk. */
const LOCAL = new Set(["download_dataset", "upload_file"]);
/** Olit tools whose description is Olit's own: the two above, and the quay.io image resolver. */
const LOCAL_DOCS = new Set([...LOCAL, "recommend_biocontainer"]);
/** Parameters Olit adds to a galaxy-mcp tool, each explained in its own schema. */
const EXTENDS: Record<string, string[]> = {
  update_page: ["expect_hash", "section_content", "section_heading"],
};

describe("the Galaxy tool surface against galaxy-mcp", () => {
  // Two independent sources: galaxy-ops' zod schemas against galaxy-mcp's Python signatures.
  it("takes exactly galaxy-mcp's parameters for every operation galaxy-ops runs", () => {
    for (const tool of opsTools()) {
      expect(params(tool), tool.name).toEqual([...(UPSTREAM[tool.name] ?? [])].sort());
    }
  });

  // Olit's own schemas against the same signatures: a parameter galaxy-mcp documents and Olit
  // drops is one the model is told about and cannot pass.
  it("takes galaxy-mcp's parameters for every tool Olit runs itself", () => {
    for (const tool of galaxyTools()) {
      if (tool.name in UPSTREAM && !LOCAL.has(tool.name)) {
        const expected = [...UPSTREAM[tool.name], ...(EXTENDS[tool.name] ?? [])].sort();
        expect(params(tool), tool.name).toEqual(expected);
      }
    }
  });

  it("tells the model what galaxy-mcp tells it, never a copy kept here", () => {
    for (const tool of [...opsTools(), ...galaxyTools()]) {
      if (tool.name in DOCS && !LOCAL_DOCS.has(tool.name)) {
        expect(tool.description, tool.name).toBe(DOCS[tool.name]);
      }
    }
  });

  it("offers each name once: a galaxy-ops operation and an Olit tool never share one", () => {
    const names = [...opsTools(), ...galaxyTools()].map((t) => t.name);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it("offers every galaxy-mcp tool except the connection, which Olit's session already has", () => {
    const offered = new Set([...opsTools(), ...galaxyTools()].map((t) => t.name));
    const missing = Object.keys(UPSTREAM).filter((name) => !offered.has(name));
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
