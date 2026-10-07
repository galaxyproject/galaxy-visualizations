export const LoomWidgetKey = {
  Plan: "plan",
  Steps: "steps",
  Results: "results",
  Parameters: "parameters",
  Notebook: "notebook",
  PlanView: "plan-view",
  Activity: "activity",
  // JSON, not markdown: the live Galaxy history projection (shared/galaxy-live-contract).
  GalaxyLive: "galaxy-live",
};

export function encodeMarkdownWidget(markdown) {
  return [markdown];
}

export function decodeMarkdownWidget(lines) {
  return (lines || []).join("\n");
}

export function encodeJsonWidget(value) {
  return [JSON.stringify(value)];
}

export function decodeJsonWidget(lines) {
  if (!lines || lines.length === 0) {
    throw new Error("Widget payload missing");
  }
  return JSON.parse(lines[0]);
}
