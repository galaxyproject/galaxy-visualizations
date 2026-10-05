const HEADING = /^#{1,6}\s/;
const ENCODED_ID = /^[0-9a-f]{16}$/;
/** The directive arguments that name a Galaxy object by its id. */
const OBJECT_ARGUMENT =
  /\b(history_dataset_id|history_dataset_collection_id)\s*=\s*["']?([^\s,)"']+)/g;

/** Directive arguments naming a Galaxy object by something that is not its id. */
export function malformedObjectIds(content: string | undefined): string[] {
  return [...(content ?? "").matchAll(OBJECT_ARGUMENT)]
    .filter(([, , value]) => !ENCODED_ID.test(value))
    .map(([, name, value]) => `${name}=${value}`);
}

/** Galaxy's page hash, in `sectionDiffUtils.ts` and `page_assistant.py`. */
export function djb2Hash(text: string | undefined): string {
  let h = 5381;
  for (const ch of text ?? "") {
    h = (h * 33 + ch.codePointAt(0)!) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Sections as `[heading, text]`, split on the first heading of each block. */
export function markdownSections(content: string | undefined): [string, string][] {
  if (!content) {
    return [];
  }
  const sections: [string, string][] = [];
  let heading = "";
  let current: string[] = [];
  content.split("\n").forEach((line, i) => {
    if (HEADING.test(line)) {
      if (i > 0) {
        sections.push([heading, current.join("\n")]);
      }
      heading = line;
      current = [line];
    } else {
      current.push(line);
    }
  });
  sections.push([heading, current.join("\n")]);
  return sections;
}

/** Replace the section under `targetHeading`, appending it when absent. */
export function applySectionEdit(
  content: string,
  targetHeading: string,
  newSection: string,
): string {
  let found = false;
  const parts = markdownSections(content).map(([heading, text]) => {
    if (heading === targetHeading) {
      found = true;
      return newSection;
    }
    return text;
  });
  if (!found) {
    parts.push(newSection);
  }
  return parts.join("\n");
}
