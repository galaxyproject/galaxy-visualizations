/**
 * The chat's markdown, as Olit renders the model's replies: raw HTML shows as text, and an image
 * loads only from Galaxy's own origin or inline data. A reply can otherwise make the browser fetch
 * any URL, carrying whatever the reply puts in it, without the user clicking anything.
 *
 * The vendored chat renders through this `marked` instance, which nothing else in Olit uses.
 */
import { marked } from "marked";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Galaxy's own origin, or inline data; the frame's location is about:blank, its base is Galaxy. */
function loadable(href: string): boolean {
  try {
    const url = new URL(href, document.baseURI);
    return url.origin === self.origin || url.protocol === "data:";
  } catch {
    return false;
  }
}

let registered = false;

/** Register the policy on the chat's `marked`, once however often the chat is set up. */
export function useChatMarkdown() {
  if (registered) return;
  registered = true;
  marked.use({
    renderer: {
      html: ({ text }) => escape(text),
      image: ({ href, text }) =>
        loadable(href) ? false : `<a href="${escape(href)}">${escape(text || href)}</a>`,
    },
  });
}
