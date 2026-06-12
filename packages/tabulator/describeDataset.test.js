import { describe, it, expect } from "vitest";
import { describeDataset } from "./describeDataset.js";

describe("describeDataset", () => {
    it("returns hasHeader=true when column_names matches columns (tsv/csv)", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: ["SampleID", "Tissue", "Score"],
            metadata_column_types: ["str", "str", "float"],
            metadata_data_lines: 100,
        });
        expect(result.dataStartOffset).toBe(1);
        expect(result.columnCount).toBe(3);
        expect(result.columnTitles).toEqual(["SampleID", "Tissue", "Score"]);
        expect(result.totalDataRows).toBe(99);
    });

    it("falls back to column_types as titles for plain tabular", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: null,
            metadata_column_types: ["str", "str", "float"],
            metadata_data_lines: 200,
        });
        expect(result.dataStartOffset).toBe(0);
        expect(result.columnTitles).toEqual(["str", "str", "float"]);
        expect(result.totalDataRows).toBe(200);
    });

    it("returns hasHeader=false when column_names length differs from columns", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: ["only-one"],
            metadata_column_types: ["str", "str", "float"],
            metadata_data_lines: 50,
        });
        expect(result.dataStartOffset).toBe(0);
        expect(result.columnTitles).toEqual(["str", "str", "float"]);
    });

    it("returns hasHeader=false when column_names is empty but columnCount is non-zero", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: [],
            metadata_column_types: ["str", "str", "float"],
            metadata_data_lines: 50,
        });
        expect(result.dataStartOffset).toBe(0);
    });

    it("rejects hasHeader on the degenerate columnCount=0 case", () => {
        // Without the columnCount > 0 guard, `[].length === 0` would flip
        // hasHeader to true and the tabulator would slice into valid data.
        const result = describeDataset({
            metadata_columns: 0,
            metadata_column_names: [],
            metadata_column_types: [],
            metadata_data_lines: 0,
        });
        expect(result.dataStartOffset).toBe(0);
        expect(result.columnCount).toBe(0);
        expect(result.columnTitles).toEqual([]);
    });

    it("falls back columnCount to column_types length when metadata_columns is missing", () => {
        const result = describeDataset({
            metadata_column_types: ["str", "float"],
            metadata_data_lines: 10,
        });
        expect(result.columnCount).toBe(2);
    });

    it("falls back missing metadata_data_lines to the LINES sentinel", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: null,
            metadata_column_types: ["str", "str", "float"],
        });
        // No data_lines reported → 99999 sentinel keeps the table paginating
        // until an empty page comes back.
        expect(result.totalDataRows).toBe(99999);
    });

    it("returns hasHeader=false when column_names is not an array", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: "not-an-array",
            metadata_column_types: ["str", "str", "float"],
            metadata_data_lines: 10,
        });
        expect(result.dataStartOffset).toBe(0);
    });

    it("pads columnTitles to columnCount when titles array is shorter", () => {
        const result = describeDataset({
            metadata_columns: 5,
            metadata_column_names: null,
            metadata_column_types: ["str", "float"],
            metadata_data_lines: 10,
        });
        // columnCount derives from metadata_columns (5); column_types only
        // has 2 entries, so positions 2..4 fill with "".
        expect(result.columnCount).toBe(5);
        expect(result.columnTitles).toEqual(["str", "float", "", "", ""]);
    });

    it("coerces a numeric-string metadata_columns", () => {
        const result = describeDataset({
            metadata_columns: "3",
            metadata_column_names: ["a", "b", "c"],
            metadata_column_types: ["str", "str", "float"],
            metadata_data_lines: 50,
        });
        expect(result.columnCount).toBe(3);
        expect(result.dataStartOffset).toBe(1);
    });
});
