/**
 * Single sanitizer for every site that renders agent-authored markdown
 * via `innerHTML`. The agent emits free-form text that may include
 * arbitrary HTML (because `marked@18` no longer strips it by default);
 * combined with file-system access via the preload bridge, an
 * unsanitized `<script>` or `<img onerror=…>` would be a renderer-RCE.
 *
 * Always go through `renderMarkdown(...)` — never assign
 * `marked.parse(text)` directly to `innerHTML`. The `Marked` instance
 * argument lets the notebook pane keep its image/link rewrites while
 * still passing through the same sanitizer.
 */

import { marked, type Marked } from "marked";
import DOMPurify, { type Config } from "dompurify";
import { linkGalaxyArtifacts } from "./galaxy-links.js";

const PURIFY_CONFIG: Config = {
  USE_PROFILES: { html: true },
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|data:image|orbit-artifact):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  ADD_ATTR: ["target"],
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLAnchorElement && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMarkdown(
  text: string,
  instance: Marked | typeof marked = marked,
  galaxyServerUrl?: string | null,
): string {
  const html = instance.parse(text, { async: false }) as string;
  const container = document.createElement("div");
  container.innerHTML = DOMPurify.sanitize(html, PURIFY_CONFIG);
  linkGalaxyArtifacts(container, galaxyServerUrl);
  return container.innerHTML;
}
