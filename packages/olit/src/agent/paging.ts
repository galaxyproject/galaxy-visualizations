export const ROW_CAP = 100;
export const ROW_BYTES_CAP = 32 * 1024;

export interface Page<T> {
  items: T[];
  shown: number;
  truncated?: true;
  next_offset?: number;
}

/** A window Galaxy paged itself, given `limit + 1` rows so the extra one reports the rest. */
export function serverPage<T>(rows: T[], offset = 0, limit = ROW_CAP): Page<T> {
  const start = Math.max(0, Math.trunc(offset || 0));
  const window: T[] = [];
  let size = 0;
  for (const row of rows.slice(0, Math.trunc(limit || ROW_CAP))) {
    size += JSON.stringify(row).length;
    if (window.length && size > ROW_BYTES_CAP) {
      break;
    }
    window.push(row);
  }
  const out: Page<T> = { items: window, shown: window.length };
  if (window.length < rows.length) {
    out.truncated = true;
    out.next_offset = start + window.length;
  }
  return out;
}
