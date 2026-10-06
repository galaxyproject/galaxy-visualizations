import { segment, type Galaxy } from "../agent/galaxy";
import type { ArtifactOf } from "./kinds";

/** What Galaxy's VisualizationFrame hands a plugin in `data-incoming`, built from the artifact. */
export function incoming(a: ArtifactOf<"visualization">, plugin: unknown, root: string) {
  return {
    root,
    visualization_config: { dataset_id: a.dataset_id, settings: a.settings, tracks: a.tracks },
    visualization_id: a.visualization_id,
    visualization_plugin: plugin,
    visualization_title: a.title,
  };
}

/** Render a Galaxy visualization from its config, mounted as Galaxy's VisualizationFrame mounts it. */
export async function renderVisualization(
  body: HTMLElement,
  a: ArtifactOf<"visualization">,
  galaxy: Pick<Galaxy, "get" | "root">,
): Promise<void> {
  let plugin;
  try {
    plugin = await galaxy.get(`api/plugins/${segment(a.visualization)}`);
  } catch (e) {
    body.textContent = `Visualization '${a.visualization}' not available: ${e}.`;
    return;
  }
  const frame = document.createElement("iframe");
  frame.title = "Galaxy visualization";
  frame.style.cssText = "width:100%;height:100%;min-height:320px;border:0;";
  body.appendChild(frame);
  const doc = frame.contentDocument!;
  const attr = plugin?.entry_point?.attr;
  if (!attr?.src) {
    doc.body.textContent = `Unable to locate plugin module for: ${a.visualization}.`;
    return;
  }
  // Galaxy's own paths, which are this page's too once Galaxy serves it.
  const root = new URL(galaxy.root, document.baseURI);
  const app = doc.createElement("div");
  app.id = "app";
  app.setAttribute("data-incoming", JSON.stringify(incoming(a, plugin, root.href)));
  doc.body.appendChild(app);
  const script = doc.createElement("script");
  script.type = attr.type || "module";
  script.src = new URL(`${plugin.href}/${attr.src}`, root).href;
  doc.body.appendChild(script);
  if (attr.css) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(`${plugin.href}/${attr.css}`, root).href;
    doc.head.appendChild(link);
  }
}
