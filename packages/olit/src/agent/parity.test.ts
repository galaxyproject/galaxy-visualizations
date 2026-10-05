import { describe, expect, it } from "vitest";

import { galaxyTools } from "./galaxy-tools";
import SNAPSHOT from "./galaxy-mcp-docs.json";
import { opsTools } from "./ops";
import DOCS from "./tool-docs.json";

const UPSTREAM = SNAPSHOT.params as Record<string, string[]>;
const params = (tool: { parameters: Record<string, unknown> }) =>
  Object.keys((tool.parameters as { properties?: object }).properties ?? {}).sort();

describe("the Galaxy tool surface against galaxy-mcp", () => {
  it("takes exactly galaxy-mcp's parameters for every operation galaxy-ops runs", () => {
    for (const tool of opsTools()) {
      expect(params(tool), tool.name).toEqual([...(UPSTREAM[tool.name] ?? [])].sort());
    }
  });

  it("describes every galaxy-mcp tool Olit offers with its certified docstring", () => {
    for (const tool of [...opsTools(), ...galaxyTools()]) {
      if (tool.name in UPSTREAM) {
        expect(tool.description, tool.name).toBe((DOCS as Record<string, string>)[tool.name]);
      }
    }
  });

  it("offers every galaxy-mcp tool except the connection, which Olit's session already has", () => {
    const offered = new Set([...opsTools(), ...galaxyTools()].map((t) => t.name));
    const missing = Object.keys(UPSTREAM).filter((name) => !offered.has(name));
    expect(missing).toEqual(["connect"]);
  });
});
