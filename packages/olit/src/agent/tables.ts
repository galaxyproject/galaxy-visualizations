/**
 * Galaxy's tables, as their metadata describes them.
 *
 * csv and tsv (Galaxy's BaseCSV): the first row is always the header and names the columns, no
 * row is a comment, and `comment_lines` only flags that the header is there. Every other table
 * datatype reads as tabular: no header, columns by position, and `comment_lines` counting the
 * rows that start with `#` and the blank ones, wherever they are.
 */

type Json = Record<string, any>;

const HEADED = ["csv", "tsv"];

/** The column types Galaxy's `guess_type` gives a number. */
export const NUMERIC = ["int", "float"];

const isInt = (value: unknown): value is number => Number.isInteger(value);

const named = (details: Json): string[] =>
  ((details.metadata_column_names as unknown[]) || []).filter(Boolean) as string[];

/** A dataset Galaxy treats as a table: its tabular datatypes all carry column types. */
export function isTable(details: Json): boolean {
  return Array.isArray(details.metadata_column_types);
}

/** csv or tsv, whose first row is the header. */
export function isHeaded(details: Json): boolean {
  return HEADED.includes(details.extension);
}

export function delimiter(details: Json): string {
  return details.metadata_delimiter || "\t";
}

/** The columns' names: a csv or tsv header's, else `col:N` by position. */
export function columnNames(details: Json): string[] {
  if (isHeaded(details)) {
    return named(details);
  }
  const count = details.metadata_columns;
  return isInt(count) && count > 0 ? Array.from({ length: count }, (_, i) => `col:${i + 1}`) : [];
}

/** Galaxy's type for each column, by position. */
export function columnTypes(details: Json): string[] {
  return isTable(details) ? (details.metadata_column_types as string[]) : [];
}

/** The names of the columns Galaxy typed as numbers. */
export function numericColumns(details: Json): string[] {
  const types = columnTypes(details);
  return columnNames(details).filter((_, i) => NUMERIC.includes(types[i]));
}

/** A Vega expression naming one column of `datum`. */
const field = (name: string) => `datum[${JSON.stringify(name)}]`;

/**
 * Which parsed rows Galaxy counts as data, as a Vega expression over `datum`, or null when every
 * row is. A blank line is never data; in a tabular dataset with comments, neither is a row whose
 * first field starts with `#`. Galaxy does not count a csv's or tsv's blank lines apart, so they
 * are always looked for. The `#` is read off the first column's text, so when that column is
 * numeric it is in `numericAfter`: converted after the test rather than while the file is read.
 */
export function dataRows(details: Json): { test: string; numericAfter: string[] } | null {
  const names = columnNames(details);
  const comments = !isHeaded(details) && (details.metadata_comment_lines || 0) > 0;
  if (!names.length || (!isHeaded(details) && !comments)) {
    return null;
  }
  const filled = names.map((n) => `(isValid(${field(n)}) && ${field(n)} !== '')`).join(" || ");
  if (!comments) {
    return { test: filled, numericAfter: [] };
  }
  const first = names[0];
  return {
    test: `(${filled}) && !test(/^#/, '' + ${field(first)})`,
    numericAfter: numericColumns(details).includes(first) ? [first] : [],
  };
}

/** Why the rows cannot be read as the metadata describes them, or null when they can. */
export function unreadable(details: Json): string | null {
  const columns = details.metadata_columns;
  if (!isInt(columns) || columns < 1) {
    return "Galaxy reports no column count for this dataset, so how its rows divide is unknown.";
  }
  if (isHeaded(details)) {
    return named(details).length
      ? null
      : `Galaxy reports no header for this ${details.extension} dataset, so its columns are unnamed.`;
  }
  if (named(details).length) {
    return (
      `Galaxy names this "${details.extension}" dataset's columns, but not from a header row in ` +
      "the file. Convert it to csv or tsv with a Galaxy tool and use that."
    );
  }
  return null;
}
