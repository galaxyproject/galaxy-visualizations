import type { Galaxy } from "../agent/galaxy";
import { renderMermaid } from "./mermaid";
import type { Artifact, ArtifactOf, Kind } from "./kinds";
import { renderVega } from "./vega";
import { renderVisualization } from "./visualization";

export type { Artifact } from "./kinds";

/** How each kind draws in the pane: kinds Olit makes itself, and Galaxy's own visualizations. */
const PANE: {
  [K in Kind]: (
    body: HTMLElement,
    artifact: ArtifactOf<K>,
    root: string,
    galaxy: Pick<Galaxy, "get" | "root">,
  ) => unknown;
} = {
  "vega-lite": (body, a, root) => renderVega(body, a.spec, root),
  mermaid: (body, a) => renderMermaid(body, a.diagram),
  visualization: (body, a, _root, galaxy) => renderVisualization(body, a, galaxy),
};

/** What the pane shows for a list: the newest, since a live turn clears the pane first. */
export function paneArtifacts(artifacts: Artifact[]): Artifact[] {
  return artifacts.length ? [artifacts[artifacts.length - 1]] : [];
}

/** Append an artifact card to the pane. */
export async function renderArtifact(
  content: HTMLElement,
  artifact: Artifact,
  root: string,
  galaxy: Pick<Galaxy, "get" | "root">,
): Promise<void> {
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

  await (
    PANE[artifact.kind] as (b: HTMLElement, a: Artifact, r: string, g: typeof galaxy) => unknown
  )(body, artifact, root, galaxy);
}
