import { quote } from "./quote";
import type { Artifact } from "./tool";
import { fence } from "./vega";

const TOKEN = /\{\{\s*artifact\s*(?::\s*([^{}]*?)\s*)?\}\}/g;

const fenced = (label: string, body: string) => "```" + label + "\n" + body + "\n```";

const str = (value: unknown) => String(value ?? "null");

/** Page markdown per artifact kind. */
export const RENDERERS: Record<string, (artifact: Artifact) => string> = {
  "vega-lite": (artifact) => fence((artifact.spec as Record<string, unknown>) || {}),
  visualization: (artifact) =>
    fenced(
      "galaxy",
      `visualization(visualization_id=${str(artifact.visualization)}, ` +
        `history_dataset_id=${str(artifact.dataset_id)})`,
    ),
  mermaid: (artifact) => fenced("mermaid", (artifact.diagram as string) || ""),
};

/** This artifact as page markdown, or null when no renderer covers its kind. */
export function render(artifact: Artifact | null | undefined): string | null {
  const renderer = Object.hasOwn(RENDERERS, artifact?.kind ?? "")
    ? RENDERERS[artifact!.kind]
    : undefined;
  return renderer ? renderer(artifact!) : null;
}

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** Whether `offset` sits inside a fenced block. */
function insideFence(text: string, offset: number): boolean {
  let mark: string | null = null;
  let position = 0;
  for (const [line, body] of text.matchAll(/([^\r\n]*)(?:\r\n|\r|\n|$)/g)) {
    if (position >= offset || !line) {
      break;
    }
    const found = FENCE_LINE.exec(body);
    if (found) {
      const opener = found[1];
      const closes: boolean =
        mark !== null && opener[0] === mark[0] && opener.length >= mark.length && !found[2].trim();
      mark = closes ? null : (mark ?? opener);
    }
    position += line.length;
  }
  return mark !== null;
}

/** The artifact a token names, most recent first. */
function pick(title: string | undefined, artifacts: Artifact[]): Artifact | undefined {
  if (!title) {
    return artifacts[artifacts.length - 1];
  }
  const wanted = title.trim().toLowerCase();
  return [...artifacts].reverse().find((a) => (a.title || "").toLowerCase() === wanted);
}

const titles = (artifacts: Artifact[]) => artifacts.map((a) => a.title).filter(Boolean);

/** Replace every {{artifact}} token in `value`; a non-string passes through unchanged. */
export function resolveArtifacts<T>(
  value: T,
  artifacts: Artifact[],
): { text: T | string; refusal: string | null } {
  if (typeof value !== "string" || !value.match(TOKEN)) {
    return { text: value, refusal: null };
  }
  let refusal: string | null = null;
  const text = value.replace(TOKEN, (match, title: string | undefined, offset: number) => {
    if (insideFence(value, offset)) {
      refusal ??=
        "A token expands to a complete fenced block, so write {{artifact}} on its own " +
        "line outside any fence.";
      return match;
    }
    const artifact = pick(title, artifacts);
    if (!artifact) {
      if (refusal === null) {
        refusal = title
          ? `No artifact titled ${quote(title)} in this session.`
          : "No artifact has been produced in this session yet.";
      }
      if (titles(artifacts).length) {
        refusal += ` Available: ${titles(artifacts).join(", ")}.`;
      }
      return match;
    }
    const markdown = render(artifact);
    if (markdown === null) {
      refusal ??=
        `A ${quote(artifact.kind)} artifact cannot be written into a Galaxy page; ` +
        `a page holds ${Object.keys(RENDERERS).sort().join(", ")}.`;
      return match;
    }
    return markdown;
  });
  return { text, refusal };
}
