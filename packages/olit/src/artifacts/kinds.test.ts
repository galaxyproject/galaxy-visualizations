import type { EntryRecord } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";

import { artifactsOf, toPage, type Artifact } from "./kinds";

const body = (markdown: string, label: string) =>
  JSON.parse(markdown.slice(`\`\`\`${label}\n`.length, -"\n```".length));

describe("an artifact written into a page", () => {
  it("makes a chart a vega cell holding its spec", () => {
    const out = toPage({ kind: "vega-lite", title: "Glucose by BMI", spec: { mark: "point" } });
    expect(body(out, "vega")).toEqual({ mark: "point" });
  });

  it("makes a diagram a mermaid cell", () => {
    const out = toPage({ kind: "mermaid", title: "Dataset lineage", diagram: "graph TD;\nA-->B;" });
    expect(out).toBe("```mermaid\ngraph TD;\nA-->B;\n```");
  });

  it("makes a visualization Galaxy's visualization block, holding its whole config", () => {
    const viz: Artifact = {
      kind: "visualization",
      title: "Reads",
      visualization: "igv",
      dataset_id: "d1",
      settings: { genome: "hg38" },
      tracks: [{ name: "reads" }],
      visualization_id: "v1",
    };
    expect(body(toPage(viz), "visualization")).toEqual({
      visualization_name: "igv",
      visualization_title: "Reads",
      dataset_id: "d1",
      settings: { genome: "hg38" },
      tracks: [{ name: "reads" }],
    });
  });
});

describe("the artifacts results carried", () => {
  const result = (artifacts: unknown[]) =>
    ({
      id: 1,
      kind: "pi.tool-result",
      model: [{ role: "toolResult", details: { artifacts } }],
    }) as unknown as EntryRecord;

  it("reads them off the results in order", () => {
    const chart = { kind: "mermaid", title: "a", diagram: "graph TD;" };
    expect(
      artifactsOf([result([chart]), result([{ ...chart, title: "b" }])]).map((a) => a.title),
    ).toEqual(["a", "b"]);
  });

  it("drops a kind Olit does not know, as a saved document may carry", () => {
    expect(artifactsOf([result([{ kind: "sankey", title: "x" }])])).toEqual([]);
  });
});
