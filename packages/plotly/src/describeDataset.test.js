import { describe, it, expect } from "vitest";
import { describeDataset, sliceColumns } from "./describeDataset.js";

describe("describeDataset", () => {
    it("returns hasHeader=true when column_names matches columns (tsv/csv)", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: ["SampleID", "Tissue", "Score"],
            metadata_column_types: ["str", "str", "float"],
        });
        expect(result.hasHeader).toBe(true);
        expect(result.dataStartOffset).toBe(1);
        expect(result.columnCount).toBe(3);
        expect(result.columnNames).toEqual(["SampleID", "Tissue", "Score"]);
        expect(result.columnTypes).toEqual(["str", "str", "float"]);
    });

    it("returns hasHeader=false when column_names is null (plain tabular)", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: null,
            metadata_column_types: ["str", "str", "float"],
        });
        expect(result.hasHeader).toBe(false);
        expect(result.dataStartOffset).toBe(0);
        expect(result.columnNames).toEqual([]);
    });

    it("returns hasHeader=false when column_names is empty but columnCount is non-zero", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: [],
            metadata_column_types: ["str", "str", "float"],
        });
        expect(result.hasHeader).toBe(false);
        expect(result.dataStartOffset).toBe(0);
    });

    it("returns hasHeader=false when column_names length differs from columns", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: ["only-one"],
            metadata_column_types: ["str", "str", "float"],
        });
        expect(result.hasHeader).toBe(false);
        expect(result.dataStartOffset).toBe(0);
    });

    it("rejects hasHeader on the degenerate columnCount=0 case", () => {
        // Without the columnCount > 0 guard, `[].length === 0` would flip
        // hasHeader to true and downstream variants would slice into
        // otherwise-valid data.
        const result = describeDataset({
            metadata_columns: 0,
            metadata_column_names: [],
            metadata_column_types: [],
        });
        expect(result.hasHeader).toBe(false);
        expect(result.dataStartOffset).toBe(0);
        expect(result.columnCount).toBe(0);
    });

    it("falls back columnCount to column_types length when metadata_columns is missing", () => {
        const result = describeDataset({
            metadata_column_types: ["str", "float"],
        });
        expect(result.columnCount).toBe(2);
    });

    it("returns empty columnTypes when metadata_column_types is null", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: null,
            metadata_column_types: null,
        });
        expect(result.columnTypes).toEqual([]);
    });

    it("returns hasHeader=false when column_names is not an array", () => {
        const result = describeDataset({
            metadata_columns: 3,
            metadata_column_names: "not-an-array",
            metadata_column_types: ["str", "str", "float"],
        });
        expect(result.hasHeader).toBe(false);
    });

    it("coerces a numeric-string metadata_columns", () => {
        const result = describeDataset({
            metadata_columns: "3",
            metadata_column_names: ["a", "b", "c"],
            metadata_column_types: ["str", "str", "float"],
        });
        expect(result.columnCount).toBe(3);
        expect(result.hasHeader).toBe(true);
    });
});

describe("sliceColumns", () => {
    it("is a no-op when offset is 0", () => {
        const columnsList = [{ x: [1, 2, 3], y: [4, 5, 6] }];
        sliceColumns(columnsList, 0);
        expect(columnsList).toEqual([{ x: [1, 2, 3], y: [4, 5, 6] }]);
    });

    it("drops the first row of each array when offset is 1", () => {
        const columnsList = [{ x: [1, 2, 3], y: [4, 5, 6] }];
        sliceColumns(columnsList, 1);
        expect(columnsList).toEqual([{ x: [2, 3], y: [5, 6] }]);
    });

    it("slices independently per track", () => {
        const columnsList = [
            { x: ["a", "b", "c"] },
            { y: [10, 20, 30, 40] },
        ];
        sliceColumns(columnsList, 1);
        expect(columnsList).toEqual([{ x: ["b", "c"] }, { y: [20, 30, 40] }]);
    });

    it("leaves non-array track values untouched", () => {
        // Defensive: if columnsStore ever yields a missing key or a
        // non-array value, we must not throw on slice(0).
        const columnsList = [{ x: [1, 2, 3], y: undefined, label: null, extra: "skip-me" }];
        sliceColumns(columnsList, 1);
        expect(columnsList[0].x).toEqual([2, 3]);
        expect(columnsList[0].y).toBeUndefined();
        expect(columnsList[0].label).toBeNull();
        expect(columnsList[0].extra).toBe("skip-me");
    });

    it("handles an empty columnsList without throwing", () => {
        const columnsList = [];
        expect(() => sliceColumns(columnsList, 1)).not.toThrow();
        expect(columnsList).toEqual([]);
    });

    it("handles a track with no array values without throwing", () => {
        const columnsList = [{}];
        expect(() => sliceColumns(columnsList, 1)).not.toThrow();
        expect(columnsList).toEqual([{}]);
    });
});
