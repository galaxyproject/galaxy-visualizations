/**
 * Galaxy's tables, as their metadata describes them.
 *
 * csv and tsv (Galaxy's BaseCSV): the first row is always the header and names the columns, no
 * row is a comment, and `comment_lines` only flags that the header is there. Every other table
 * datatype reads as tabular: no header, columns by position, and `comment_lines` counting the
 * leading `#` and blank rows.
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
  const comments = details.metadata_comment_lines || 0;
  if (comments) {
    return (
      `the first ${comments} line(s) are comments or blank, which a reader of the file takes as ` +
      "data. Produce a dataset without them with a Galaxy tool and use that."
    );
  }
  return null;
}
