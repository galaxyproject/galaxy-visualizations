/** Thin adapter for the Charts framework `data-incoming` contract. */

export interface OlitIncoming {
  root: string;
  /** Set when Galaxy opened a saved visualization, naming the record to write back to. */
  visualizationId?: string;
  datasetId?: string;
  historyId?: string;
  specs: Record<string, any>;
  settings: Record<string, any>;
}

export function parseIncoming(container: HTMLElement): OlitIncoming {
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
    visualizationId: raw.visualization_id,
    datasetId: config.dataset_id,
    historyId: config.history_id || raw.history_id,
    specs: plugin.specs || raw.specs || {},
    settings: config.settings || {},
  };
}
