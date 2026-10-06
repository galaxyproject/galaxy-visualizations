import type { ArtifactOf } from "./kinds";

/**
 * Galaxy's display route for a visualization, under Galaxy's root: the saved copy when there is
 * one, else the plugin on the dataset with its defaults. Built here, never taken from the artifact.
 */
export function displayAddress(a: ArtifactOf<"visualization">, root = "/"): string {
  const params = new URLSearchParams({
    visualization: a.visualization,
    ...(a.visualization_id
      ? { visualization_id: a.visualization_id }
      : { dataset_id: a.dataset_id }),
    hide_panels: "true",
    hide_masthead: "true",
  });
  return `${root}visualizations/display?${params}`;
}

/** Render a Galaxy visualization in place, on the Galaxy origin that serves olit. */
export function renderVisualization(
  body: HTMLElement,
  a: ArtifactOf<"visualization">,
  root = "/",
): void {
  const frame = document.createElement("iframe");
  frame.src = new URL(displayAddress(a, root), document.baseURI).href;
  frame.title = "Galaxy visualization";
  frame.style.cssText = "width:100%;height:100%;min-height:320px;border:0;";
  frame.setAttribute("loading", "lazy");
  body.appendChild(frame);
}
