// Types for the notebook fence names. Impl is shared/notebook-fences.js.
export type NotebookFenceKind = "session" | "invocation" | "job" | "galaxy-page" | "udt";
export const NOTEBOOK_FENCE_WRITE_PREFIX: "loom";
export const NOTEBOOK_FENCE_READ_PREFIXES: readonly string[];
export function notebookFenceOpen(kind: NotebookFenceKind): string;
export function isNotebookFenceOpen(line: string, kind: NotebookFenceKind): boolean;
export function replaceNotebookBlocks(
  content: string,
  ranges: ReadonlyArray<{ start: number; end: number }>,
  newBlock: string[],
): string;
