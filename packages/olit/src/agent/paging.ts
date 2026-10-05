import { OUTPUT_BUDGET_BYTES } from "@galaxyproject/galaxy-ops/browser";

export const ROW_CAP = 100;
/** galaxy-ops' budget for one result, so every Galaxy tool pages to the same size. */
export const ROW_BYTES_CAP = OUTPUT_BUDGET_BYTES;

/** galaxy-ops' pagination envelope, which the tool descriptions promise. */
export interface Pagination {
  /** Unknown while Galaxy has more to give: it pages on the server and never counts the rest. */
  total_items: number | null;
  returned_items: number;
  limit: number;
  offset: number;
  has_next: boolean;
  has_previous: boolean;
  next_offset: number | null;
  previous_offset: number | null;
  helper_text: string;
}

/**
 * A window Galaxy paged itself, given `limit + 1` rows so the extra one reports the rest, as
 * galaxy-ops' envelope describes a page: the rows under `data`, where to go next beside them.
 */
export function serverPage<T>(
  rows: T[],
  offset = 0,
  limit = ROW_CAP,
): { data: T[]; pagination: Pagination } {
  const start = Math.max(0, Math.trunc(offset || 0));
  const size = Math.trunc(limit || ROW_CAP);
  const data: T[] = [];
  let bytes = 0;
  for (const row of rows.slice(0, size)) {
    bytes += new TextEncoder().encode(JSON.stringify(row)).length;
    if (data.length && bytes > ROW_BYTES_CAP) {
      break;
    }
    data.push(row);
  }
  const hasNext = data.length < rows.length;
  const next = start + data.length;
  return {
    data,
    pagination: {
      total_items: hasNext ? null : next,
      returned_items: data.length,
      limit: size,
      offset: start,
      has_next: hasNext,
      has_previous: start > 0,
      next_offset: hasNext ? next : null,
      previous_offset: start > 0 ? Math.max(0, start - size) : null,
      helper_text: hasNext
        ? `Showing ${data.length} items from offset ${start}; more follow. Pass offset=${next} for the next page.`
        : `Showing ${data.length} items from offset ${start}; this is the last page.`,
    },
  };
}
