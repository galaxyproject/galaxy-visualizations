/** Thin adapter for the Charts framework `data-incoming` contract. */

export interface OlitIncoming {
  root: string;
  /** Set when Galaxy opened a saved visualization, naming the record to write back to. */
  visualizationId?: string;
  datasetId?: string;
  specs: Record<string, any>;
  settings: Record<string, any>;
}

/** `hostSearch` is the hosting page's query, read for a `visualization_id` the config lacks. */
export function parseIncoming(container: HTMLElement, hostSearch = ""): OlitIncoming {
  let raw: any;
  try {
    raw = JSON.parse(container.dataset.incoming || "{}");
  } catch (e) {
    throw new Error(`data-incoming is not JSON: ${e}`);
  }
  const config = raw.visualization_config || {};
  const plugin = raw.visualization_plugin || {};
  return {
    root: raw.root || "/",
    visualizationId:
      raw.visualization_id || new URLSearchParams(hostSearch).get("visualization_id") || undefined,
    datasetId: config.dataset_id,
    specs: plugin.specs || raw.specs || {},
    settings: config.settings || {},
  };
}
