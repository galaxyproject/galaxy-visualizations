/**
 * Spacing between consecutive assistant text blocks (issue #200).
 *
 * A multi-step turn streams several text blocks into one accumulating buffer:
 * the model writes some prose, calls a tool, writes more prose, and so on, all
 * within a single chat message. The deltas are concatenated verbatim, so two
 * blocks render butted together once marked parses them -- "…upload to
 * Galaxy.Creating the conda env…" with no break between "Galaxy" and
 * "Creating". A blank line is markdown's paragraph separator, so inserting one
 * at each block boundary makes marked emit separate <p> elements.
 *
 * `joinTextBlocks` is called when the first delta of a *new* block arrives;
 * within a block, deltas keep appending verbatim.
 */
export function joinTextBlocks(prev: string, next: string): string {
  const left = prev.replace(/\s+$/, "");
  // Nothing meaningful before this block -- don't open with a stray break.
  if (left.length === 0) return next;
  const right = next.replace(/^\s+/, "");
  // The new block opened with only whitespace; apply the break now and let the
  // following (normal) delta append the real text after it.
  if (right.length === 0) return `${left}\n\n`;
  return `${left}\n\n${right}`;
}
