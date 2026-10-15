import { describe, expect, it } from "vitest";

import * as tables from "./tables";

const HEADER = ["Product", "Price"];
const base = { state: "ok", metadata_columns: 2, metadata_column_types: ["str", "int"] };
const tabular = {
  ...base,
  extension: "tabular",
  metadata_delimiter: "\t",
  metadata_comment_lines: 0,
};
const csv = {
  ...base,
  extension: "csv",
  metadata_delimiter: ",",
  metadata_column_names: HEADER,
  metadata_comment_lines: 1,
};
const tsv = { ...csv, extension: "tsv", metadata_delimiter: "\t" };

describe("csv and tsv rows", () => {
  it("leave out a blank line, which Galaxy counts as a data line", () => {
    for (const headed of [csv, tsv]) {
      const rows = tables.dataRows(headed);
      expect(rows?.test).not.toContain("#");
      expect(rows?.numericAfter).toEqual([]);
    }
  });
});

describe("tabular", () => {
  it("has no header: its columns go by position and its first row is data", () => {
    expect(tables.isHeaded(tabular)).toBe(false);
    expect(tables.columnNames(tabular)).toEqual(["col:1", "col:2"]);
    expect(tables.unreadable(tabular)).toBeNull();
  });

  it("reads a tabular dataset with # and blank rows, leaving those rows out as Galaxy does", () => {
    const commented = { ...tabular, metadata_comment_lines: 2 };
    expect(tables.unreadable(commented)).toBeNull();
    expect(tables.dataRows(commented)?.test).toContain("!test(/^#/");
    expect(tables.dataRows(tabular)).toBeNull();
  });

  it("converts a numeric first column after the # test, so its text is still there", () => {
    const numeric = {
      ...tabular,
      metadata_column_types: ["int", "str"],
      metadata_comment_lines: 1,
    };
    expect(tables.dataRows(numeric)?.numericAfter).toEqual(["col:1"]);
  });

  it("does not trust names a tabular datatype sets, which are not a header row", () => {
    const manifest = {
      ...tabular,
      extension: "sra_manifest.tabular",
      metadata_column_names: HEADER,
    };
    expect(tables.columnNames(manifest)).toEqual(["col:1", "col:2"]);
    expect(tables.unreadable(manifest)).toContain("not from a header row");
  });
});

describe("csv and tsv", () => {
  it("name the columns from the first row, which comment_lines only flags", () => {
    for (const details of [csv, tsv]) {
      expect(tables.isHeaded(details)).toBe(true);
      expect(tables.columnNames(details)).toEqual(HEADER);
      expect(tables.unreadable(details)).toBeNull();
    }
    expect(tables.delimiter(csv)).toBe(",");
    expect(tables.delimiter(tsv)).toBe("\t");
  });

  it("cannot be read without the header Galaxy names", () => {
    expect(tables.unreadable({ ...csv, metadata_column_names: [] })).toContain("no header");
  });
});

describe("any table", () => {
  it("names its numeric columns by Galaxy's int and float", () => {
    expect(tables.numericColumns(tabular)).toEqual(["col:2"]);
    expect(tables.numericColumns(csv)).toEqual(["Price"]);
  });

  it("is one Galaxy gives column types, and only then", () => {
    expect(tables.isTable(tabular)).toBe(true);
    expect(tables.isTable({ extension: "bam" })).toBe(false);
  });

  it("cannot be read without a column count", () => {
    expect(tables.unreadable({ ...tabular, metadata_columns: null })).toContain("no column count");
  });
});
