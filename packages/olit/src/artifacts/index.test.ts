/** Artifact dispatch: the kind selects the renderer. */

import { describe, expect, it, vi, beforeEach } from "vitest";

const renderVega = vi.fn();
const renderMermaid = vi.fn();

vi.mock("./vega", () => ({ renderVega: (...a: unknown[]) => renderVega(...a) }));
vi.mock("./mermaid", () => ({ renderMermaid: (...a: unknown[]) => renderMermaid(...a) }));

const { renderArtifact } = await import("./index");

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
