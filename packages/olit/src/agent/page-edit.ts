/** A page's saved source: `content` is the embed-expanded render, `content_editor` the source. */
export const pageBody = (page: { content_editor?: string; content?: string }) =>
  page.content_editor || page.content || "";

/**
 * The fenced cells a Galaxy page renders. Galaxy's client splits a page at every ``` line and
 * shows any other cell type as an error (`Markdown/parse.ts`, `Sections/SectionWrapper.vue`);
 * its server refuses such a page outright (`validate_galaxy_markdown_fence_types`).
 */
export const PAGE_CELL_TYPES = ["galaxy", "markdown", "vega", "visualization", "vitessce"];

/** Why Galaxy would not render `content` as a page, in its own words, or undefined. */
export function pageContentProblem(content: string): string | undefined {
  for (const line of content.split("\n")) {
    const stripped = line.trim();
    if (!stripped.startsWith("```")) continue;
    const type = stripped.slice(3);
    if (type && !PAGE_CELL_TYPES.includes(type)) {
      return (
        `Unsupported fenced block type [${type}]. Fenced blocks must be one of ` +
        `${PAGE_CELL_TYPES.join(", ")}; for a plain code block, use ~~~ fences instead of \`\`\`.`
      );
    }
  }
  return undefined;
}
