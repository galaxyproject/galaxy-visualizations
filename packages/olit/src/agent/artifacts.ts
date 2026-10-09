import { toPage, type Artifact } from "../artifacts/kinds";
import { quote } from "./quote";

const TOKEN = /\{\{\s*artifact\s*(?::\s*([^{}]*?)\s*)?\}\}/g;

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

const EMBED = /\{\{\s*visualization\b[^{}]*\}\}/g;

/**
 * Why `text` would show an embed Galaxy does not render, or null. A `{{visualization...}}` token
 * is no Galaxy syntax, so the page would show it as text in place of the chart; written as code,
 * in a fence or between backticks, it is text on purpose and stays.
 */
export function inventedEmbed(text: string): string | null {
  const prose = text.replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
  for (const found of prose.matchAll(EMBED)) {
    if (!insideFence(text, found.index!)) {
      return (
        `${quote(found[0])} is not something a Galaxy page renders, so the page would show it ` +
        "as text. To place a visualization from this session, write {{artifact}} on its own " +
        "line, or {{artifact: <title>}} for an earlier one."
      );
    }
  }
  return null;
}

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
    const block = toPage(artifact);
    if (block === undefined) {
      refusal ??=
        `${quote(artifact.title || artifact.kind)} is a ${artifact.kind} diagram, which a ` +
        "Galaxy page cannot render; describe it in the record instead.";
      return match;
    }
    return block;
  });
  return { text, refusal };
}
