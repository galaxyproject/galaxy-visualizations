import { galaxyArtifactReferences } from "../../../../shared/galaxy-artifact-links.js";
import { NOTEBOOK_FENCE_READ_PREFIXES } from "../../../../shared/notebook-fences.js";

// Notebook blocks can carry either fence prefix during the Loom -> Orbit rename.
const NOTEBOOK_BLOCK_LANGUAGE = `(?:${NOTEBOOK_FENCE_READ_PREFIXES.join("|")})-(?:galaxy-page|invocation|job)`;
const LINKABLE_LANGUAGE = new RegExp(
  `\\blanguage-(?:${NOTEBOOK_BLOCK_LANGUAGE}|ya?ml|json|text)\\b`,
);
const NOTEBOOK_BLOCK = new RegExp(`\\blanguage-${NOTEBOOK_BLOCK_LANGUAGE}\\b`);

/**
 * Link explicit Galaxy references in an already sanitized DOM. Text and code
 * remain byte-for-byte copyable; existing links and executable code fences are
 * untouched. Never infer an artifact's type from a bare hash.
 */
export function linkGalaxyArtifacts(
  root: HTMLElement | DocumentFragment,
  serverUrl?: string | null,
): void {
  const scopes = Array.from(root.querySelectorAll<HTMLElement>("pre, p, li, td, th")).filter(
    (el) => !el.querySelector("pre, p, li, td, th"),
  );
  if (!scopes.length && root instanceof HTMLElement) scopes.push(root);
  for (const scope of scopes) {
    if (!eligible(scope)) continue;
    const text = scope.textContent ?? "";
    // Only a notebook block's own galaxy_server_url may re-point its IDs; any
    // other text (tool output, fetched pages, file previews) links to the
    // connected server, so it can't aim "Open Galaxy" links at another host.
    const trustTextServer = isNotebookBlock(scope);
    // Reverse order keeps earlier text offsets stable while inserting anchors.
    for (const ref of galaxyArtifactReferences(text, serverUrl, { trustTextServer }).reverse()) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let start: { node: Text; offset: number } | undefined;
      let end: { node: Text; offset: number } | undefined;
      let blocked = false;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const next = offset + node.length;
        if (next > ref.start && offset < ref.end) {
          if (node.parentElement?.closest("a, button, script, style, textarea")) blocked = true;
          start ??= { node, offset: Math.max(0, ref.start - offset) };
          end = { node, offset: Math.min(node.length, ref.end - offset) };
        }
        offset = next;
      }
      if (blocked || !start || !end) continue;
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const link = document.createElement("a");
      link.href = ref.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "galaxy-artifact-link";
      // Electron shows no status bar on hover, so the title is where the host shows.
      const host = new URL(ref.href).host;
      link.title =
        ref.kind === "revision"
          ? `View saved Galaxy page revision (JSON) on ${host}`
          : `Open Galaxy ${ref.kind} on ${host}`;
      link.appendChild(range.extractContents());
      range.insertNode(link);
    }
  }
}

function eligible(el: HTMLElement): boolean {
  if (el.tagName !== "PRE") return true;
  const language = el.querySelector("code")?.className ?? "";
  // Don't turn Python, shell scripts, or Markdown examples into UI controls.
  return !language || LINKABLE_LANGUAGE.test(language);
}

function isNotebookBlock(el: HTMLElement): boolean {
  return el.tagName === "PRE" && NOTEBOOK_BLOCK.test(el.querySelector("code")?.className ?? "");
}
