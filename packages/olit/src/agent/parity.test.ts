import { describe, expect, it } from "vitest";

import { galaxyTools } from "./galaxy-tools";
import SNAPSHOT from "./galaxy-mcp-docs.json";
import { opsTools } from "./ops";

/** galaxy-mcp's Python signatures and docstrings, captured from its source. */
const UPSTREAM = SNAPSHOT.params as Record<string, string[]>;
const DOCS = SNAPSHOT.docs as Record<string, string>;
const params = (tool: { parameters: Record<string, unknown> }) =>
  Object.keys((tool.parameters as { properties?: object }).properties ?? {}).sort();

/** Tools Olit runs on the browser's in-memory filesystem, which galaxy-mcp runs on disk. */
const LOCAL = new Set(["download_dataset", "upload_file"]);
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
      if (tool.name in DOCS && !LOCAL.has(tool.name)) {
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
});
