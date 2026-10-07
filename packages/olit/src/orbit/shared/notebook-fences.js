// Fence names for the typed blocks Loom keeps in notebook.md. Shared so the
// brain and the Orbit renderer agree on what counts as one of our blocks.
//
// The product is being renamed from Loom to Orbit, and notebooks outlive any
// one release: a CLI and a bundled desktop app can be different versions
// pointed at the same notebook. So readers accept every prefix here forever,
// while writers use exactly one. Flipping NOTEBOOK_FENCE_WRITE_PREFIX is the
// whole write-side switch; upserts rewrite a matched block under it, so a
// mixed notebook converges instead of growing duplicates.

export const NOTEBOOK_FENCE_WRITE_PREFIX = "loom";

export const NOTEBOOK_FENCE_READ_PREFIXES = Object.freeze(["loom", "orbit"]);

/** @typedef {"session" | "invocation" | "job" | "galaxy-page" | "udt"} NotebookFenceKind */

/** @param {NotebookFenceKind} kind @returns {string} */
export function notebookFenceOpen(kind) {
  return "```" + NOTEBOOK_FENCE_WRITE_PREFIX + "-" + kind;
}

/** @param {string} line @param {NotebookFenceKind} kind @returns {boolean} */
export function isNotebookFenceOpen(line, kind) {
  const trimmed = line.trim();
  return NOTEBOOK_FENCE_READ_PREFIXES.some((p) => trimmed === "```" + p + "-" + kind);
}

/**
 * Replace every block in `ranges` with `newBlock`, written where the first one
 * sat. Two blocks sharing a key can only come from a writer that didn't
 * recognise the other prefix, so collapsing them is what keeps the key unique.
 *
 * @param {string} content
 * @param {ReadonlyArray<{ start: number; end: number }>} ranges line ranges, inclusive of both fences
 * @param {string[]} newBlock
 * @returns {string}
 */
export function replaceNotebookBlocks(content, ranges, newBlock) {
  const lines = content.split("\n");
  if (ranges.length === 0) return content;
  const drop = new Set();
  for (const r of ranges) {
    for (let li = r.start; li <= r.end; li++) drop.add(li);
  }
  const insertAt = Math.min(...ranges.map((r) => r.start));
  const rebuilt = [];
  for (let li = 0; li < lines.length; li++) {
    if (li === insertAt) rebuilt.push(...newBlock);
    if (drop.has(li)) continue;
    rebuilt.push(lines[li]);
  }
  return rebuilt.join("\n");
}
