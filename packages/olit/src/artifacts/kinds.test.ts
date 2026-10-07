import type { EntryRecord } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";

import { pageContentProblem } from "../agent/page-edit";
import { artifactsOf, PAGE, toPage, type Artifact, type ArtifactOf } from "./kinds";
import { incoming } from "./visualization";

const body = (markdown: string | undefined, label: string) =>
  JSON.parse(markdown!.slice(`\`\`\`${label}\n`.length, -"\n```".length));

describe("an artifact written into a page", () => {
  it("makes a chart a vega cell holding its spec", () => {
    const out = toPage({ kind: "vega-lite", title: "Glucose by BMI", spec: { mark: "point" } });
    expect(body(out, "vega")).toEqual({ mark: "point" });
  });

  it("gives a diagram no page form, since Galaxy renders no mermaid cell", () => {
    expect(PAGE.mermaid).toBeNull();
    expect(toPage({ kind: "mermaid", title: "Lineage", diagram: "graph TD;" })).toBeUndefined();
  });

  it("writes every kind it can place as a cell Galaxy renders", () => {
    const samples: Artifact[] = [
      { kind: "vega-lite", title: "c", spec: {} },
      { kind: "visualization", title: "v", visualization: "igv", dataset_id: "d1" },
    ];
    for (const a of samples) {
      expect(pageContentProblem(toPage(a)!), a.kind).toBeUndefined();
    }
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

describe("a visualization in a page and in the pane", () => {
  /** What Galaxy's MarkdownVisualization.vue processContent hands VisualizationFrame. */
  const asGalaxyPage = (markdown: string) => {
    const parsed = JSON.parse(markdown.slice("```visualization\n".length, -"\n```".length));
    return {
      name: parsed.visualization_name,
      config: {
        dataset_id: parsed.dataset_id,
        dataset_url: parsed.dataset_url,
        settings: parsed.settings,
        tracks: parsed.tracks,
      },
    };
  };

  it("renders the same plugin with the same config in both", () => {
    const viz: ArtifactOf<"visualization"> = {
      kind: "visualization",
      title: "Reads",
      visualization: "plotly",
      dataset_id: "d1",
      settings: { x_axis_label: "Residue" },
      tracks: [{ y: "1" }],
      visualization_id: "v1",
    };
    const page = asGalaxyPage(toPage(viz)!);
    const pane = incoming(viz, {}, "/");
    expect(page.name).toBe(viz.visualization);
    expect(page.config).toEqual({ dataset_url: undefined, ...pane.visualization_config });
  });
});
