/** A page's saved source: `content` is the embed-expanded render, `content_editor` the source. */
export const pageBody = (page: { content_editor?: string; content?: string }) =>
  page.content_editor || page.content || "";
