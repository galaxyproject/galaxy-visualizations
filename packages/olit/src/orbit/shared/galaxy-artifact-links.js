/** Galaxy navigation shared by Loom and its shells. No credentials or network I/O. */
export function normalizeGalaxyLinkServer(serverUrl) {
  if (typeof serverUrl !== "string" || !/^https?:\/\//i.test(serverUrl.trim())) return null;
  try {
    const url = new URL(serverUrl.trim());
    if (url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Read/view routes from Galaxy's client router. Pages and stored workflows use
 * /published/... even for private resources: Galaxy still enforces access.
 * Revisions have no UI deep link; use the exact read-only revision API route.
 */
export function galaxyArtifactUrl(serverUrl, kind, id, options = {}) {
  const base = normalizeGalaxyLinkServer(serverUrl);
  if (!base) return null;
  if (kind === "server") return base;
  if (typeof id !== "string" || !id) return null;
  if (kind === "tool") return `${base}/?tool_id=${encodeURIComponent(id)}`;
  if (!/^[a-f0-9]{16,}$/i.test(id)) return null;
  const encoded = encodeURIComponent(id);
  switch (kind) {
    case "history":
      return `${base}/histories/view?id=${encoded}`;
    case "dataset":
      return `${base}/datasets/${encoded}`;
    case "collection":
      return `${base}/collection/${encoded}/sheet`;
    case "job":
      return `${base}/jobs/${encoded}/view`;
    case "invocation":
      return `${base}/workflows/invocations/${encoded}`;
    case "workflow":
      return `${base}/published/workflow?id=${encoded}`;
    case "page":
      return `${base}/published/page?id=${encoded}`;
    case "revision":
      return /^[a-f0-9]{16,}$/i.test(options.pageId ?? "")
        ? `${base}/api/pages/${encodeURIComponent(options.pageId)}/revisions/${encoded}`
        : null;
    default:
      return null;
  }
}

const FIELD_KINDS = {
  page_id: "page",
  history_id: "history",
  dataset_id: "dataset",
  hda_id: "dataset",
  collection_id: "collection",
  hdca_id: "collection",
  job_id: "job",
  invocation_id: "invocation",
  workflow_id: "workflow",
  stored_workflow_id: "workflow",
  tool_id: "tool",
  last_synced_revision: "revision",
  latest_revision_id: "revision",
  revision_id: "revision",
  galaxy_server_url: "server",
  page_slug: "page",
};
const FIELDS = new RegExp(
  `\\b(${Object.keys(FIELD_KINDS).join("|")})\\b["']?\\s*[:=][ \\t]*["'\x60]?([^\\s"'\x60,}<>]+)`,
  "gi",
);

/** Flat metadata only; deliberately not an arbitrary YAML/JSON interpreter. */
function fieldsIn(text) {
  return Array.from(text.matchAll(FIELDS), (match) => {
    const field = match[1].toLowerCase();
    const kind = FIELD_KINDS[field];
    const value =
      ["server", "tool"].includes(kind) || field === "page_slug"
        ? match[2]
        : match[2].replace(/[.;]+$/, "");
    const start = match.index + match[0].lastIndexOf(match[2]);
    return { field, value, start, end: start + value.length };
  });
}

/** Null means absent; "" means explicit but ambiguous/invalid (do not guess). */
export function galaxyLinkServerInText(text) {
  const values = fieldsIn(text)
    .filter((f) => f.field === "galaxy_server_url")
    .map((f) => f.value);
  if (!values.length) return null;
  const servers = new Set(values.map(normalizeGalaxyLinkServer));
  return servers.size === 1 ? (servers.values().next().value ?? "") : "";
}

/**
 * Typed references only. Bare hashes, history item numbers, dates, etc. stay text.
 *
 * A `galaxy_server_url` in the text only redirects the other IDs when the
 * caller says the text is trusted metadata (a notebook block Loom wrote).
 * Otherwise a dataset peek, fetched page, or README could point "Open Galaxy
 * history" links at any host it likes.
 */
export function galaxyArtifactReferences(text, fallbackServer, options = {}) {
  const fields = fieldsIn(text);
  const server = options.trustTextServer
    ? (galaxyLinkServerInText(text) ?? fallbackServer)
    : fallbackServer;
  const pageIds = new Set(fields.filter((f) => f.field === "page_id").map((f) => f.value));
  const pageId = pageIds.size === 1 ? pageIds.values().next().value : undefined;
  const refs = [];
  for (const field of fields) {
    // An invocation response's workflow_id names an internal workflow version,
    // not the stored workflow required by Galaxy's published-workflow view.
    if (field.field === "workflow_id" && fields.some((f) => f.field === "invocation_id")) continue;
    const kind = FIELD_KINDS[field.field];
    const href = galaxyArtifactUrl(
      // Untrusted, the server field still links to the URL it shows -- just not the other IDs.
      kind === "server" && !options.trustTextServer ? field.value : server,
      kind,
      field.field === "page_slug" ? pageId : field.value,
      { pageId },
    );
    if (href && !["null", "~", "<none>"].includes(field.value)) {
      refs.push({ start: field.start, end: field.end, href, kind });
    }
  }
  // Prose such as `Dataset ID: abc...` or `invocation abc...`. Require an
  // encoded ID's length here so ordinary words/numeric history HIDs don't link.
  const prose =
    /\b(page|history|dataset|collection|job|invocation|workflow)(?:[ _]id)?\s*[:=#]?\s*([a-f0-9]{16,})\b/gi;
  for (const match of text.matchAll(prose)) {
    const start = match.index + match[0].lastIndexOf(match[2]);
    if (fields.some((r) => start >= r.start && start < r.end)) continue;
    const kind = match[1].toLowerCase();
    const href = galaxyArtifactUrl(server, kind, match[2]);
    if (href) refs.push({ start, end: start + match[2].length, href, kind });
  }
  // Markdown deliberately doesn't auto-link inline-code URLs. Recognize Galaxy
  // view/API routes so an explicit URL still works there, without needing a
  // connected profile or rewriting links to another server.
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    const href = match[0].replace(/[.,;!?)\]}]+$/, "");
    if (refs.some((r) => match.index < r.end && match.index + href.length > r.start)) continue;
    let url;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.username || url.password) continue;
    const path = url.pathname;
    let kind;
    if (/\/api\/pages\/[^/]+\/revisions\/[^/]+$/.test(path)) kind = "revision";
    else if (/\/published\/(page|workflow)$/.test(path))
      kind = path.endsWith("page") ? "page" : "workflow";
    else if (/\/histories\/view$/.test(path)) kind = "history";
    else if (/\/workflows\/invocations\/[^/]+(?:\/[^/]+)?$/.test(path)) kind = "invocation";
    else if (/\/jobs\/[^/]+\/view$/.test(path)) kind = "job";
    else if (/\/collection\/[^/]+\/sheet$/.test(path)) kind = "collection";
    else if (/\/datasets\/[^/]+(?:\/[^/]+)?$/.test(path)) kind = "dataset";
    if (kind) refs.push({ start: match.index, end: match.index + href.length, href, kind });
  }
  return refs.sort((a, b) => a.start - b.start);
}
