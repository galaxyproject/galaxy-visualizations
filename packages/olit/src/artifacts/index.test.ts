/** Artifact dispatch: the kind selects the renderer. */

import { describe, expect, it, vi, beforeEach } from "vitest";

const renderVega = vi.fn();
const renderMermaid = vi.fn();

vi.mock("./vega", () => ({ renderVega: (...a: unknown[]) => renderVega(...a) }));
vi.mock("./mermaid", () => ({ renderMermaid: (...a: unknown[]) => renderMermaid(...a) }));

const { renderArtifact, paneArtifacts } = await import("./index");

describe("renderArtifact", () => {
  let content: HTMLElement;

  beforeEach(() => {
    renderVega.mockClear();
    renderMermaid.mockClear();
    content = document.createElement("div");
  });

  it("routes a vega-lite artifact to the vega renderer with its spec", async () => {
    const spec = { mark: "point" };
    await renderArtifact(content, { kind: "vega-lite", title: "Chart", spec });

    expect(renderVega).toHaveBeenCalledTimes(1);
    expect(renderVega.mock.calls[0][1]).toBe(spec);
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it("routes a mermaid artifact to the mermaid renderer with its diagram", async () => {
    const diagram = "graph TD; A-->B";
    await renderArtifact(content, { kind: "mermaid", title: "Dataset lineage", diagram });

    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(renderMermaid.mock.calls[0][1]).toBe(diagram);
    expect(renderVega).not.toHaveBeenCalled();
  });

  it("renders the title as the card heading", async () => {
    await renderArtifact(content, {
      kind: "mermaid",
      title: "Dataset lineage",
      diagram: "graph TD;",
    });
    expect(content.querySelector(".artifact-card-title")?.textContent).toBe("Dataset lineage");
  });

  it("reports an unknown kind instead of rendering nothing", async () => {
    await renderArtifact(content, { kind: "sankey" });

    expect(renderVega).not.toHaveBeenCalled();
    expect(renderMermaid).not.toHaveBeenCalled();
    expect(content.textContent).toContain("Unsupported artifact type: sankey");
  });

  it("sends a Galaxy visualization to the frame at its display address", async () => {
    const url = "/visualizations/display?visualization=ngl&dataset_id=d1";
    await renderArtifact(content, { kind: "visualization", title: "Structure", url });

    expect(renderVega).not.toHaveBeenCalled();
    expect(renderMermaid).not.toHaveBeenCalled();
    expect(content.querySelector("iframe")?.getAttribute("src")).toBe(url);
  });
});

describe("paneArtifacts", () => {
  const scatter = { kind: "vega-lite", title: "Scatter Plot", spec: {} } as any;
  const regression = { kind: "vega-lite", title: "Linear Regression", spec: {} } as any;

  it("shows the newest artifact, not the first one the session produced", () => {
    // A reopened session was showing the scatter it started with instead of the
    // regression it ended on, because every stored artifact was rendered in order.
    expect(paneArtifacts([scatter, regression])).toEqual([regression]);
  });

  it("shows the only artifact when a session produced one", () => {
    expect(paneArtifacts([scatter])).toEqual([scatter]);
  });

  it("shows nothing for a session that produced none", () => {
    expect(paneArtifacts([])).toEqual([]);
  });
});
