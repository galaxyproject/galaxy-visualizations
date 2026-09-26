import { renderVega } from "./vega";
import { renderMermaid } from "./mermaid";
import { renderVisualization } from "./visualization";

/** A typed, renderable result; the kind selects the renderer. */
export interface Artifact {
  kind: string;
  title?: string;
  spec?: unknown;
  diagram?: unknown;
  [key: string]: unknown;
}

/** Append an artifact card to the pane, dispatching on kind.
 *
 * Two sources, and no third: kinds olit produces itself, and Galaxy visualizations, which
 * Galaxy renders at its own display route from a dataset or a saved visualization.
 */
/** What the pane shows for a list: the newest, since a live turn clears the pane first. */
export function paneArtifacts(artifacts: Artifact[]): Artifact[] {
  return artifacts.length ? [artifacts[artifacts.length - 1]] : [];
}

export async function renderArtifact(content: HTMLElement, artifact: Artifact): Promise<void> {
  const card = document.createElement("div");
  card.className = "artifact-card";
  card.style.cssText =
    "display:flex;flex-direction:column;height:100%;padding:12px;box-sizing:border-box;";

  if (artifact.title) {
    const title = document.createElement("div");
    title.className = "artifact-card-title";
    title.style.cssText = "font-size:13px;font-weight:600;margin-bottom:8px;";
    title.textContent = artifact.title;
    card.appendChild(title);
  }

  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:320px;";
  card.appendChild(body);
  content.appendChild(card);

  if (artifact.kind === "vega-lite" || artifact.kind === "vega") {
    await renderVega(body, artifact.spec);
  } else if (artifact.kind === "mermaid") {
    await renderMermaid(body, artifact.diagram);
  } else if (artifact.kind === "visualization") {
    renderVisualization(body, artifact.url);
  } else {
    body.textContent = `Unsupported artifact type: ${artifact.kind}`;
  }
}
