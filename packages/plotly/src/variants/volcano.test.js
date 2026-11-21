import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchColumns = vi.fn();
vi.mock("galaxy-charts", () => ({ useColumnsStore: () => ({ fetchColumns }) }));
vi.mock("@/describeDataset", () => ({ fetchDataStartOffset: async () => 0, sliceColumns: () => {} }));

const { classifyPoints, topLabels, default: plotlyVolcano } = await import("@/variants/volcano");

const genes = ["DOK6", "TBX5", "SLC6A4", "IFITM1", "NA_GENE", "TOP_GENE", "FLAT"];
const log2FoldChange = [0.51, -2.13, 3.4, -0.2, 1.8, 5.1, 2.5];
const padj = [0.0003, 0.0004, 0.01, 0.9, null, 0, 0.3];

const settings = {
    down_color: "#0000ff",
    fold_threshold: 1,
    label_count: 2,
    none_color: "#cccccc",
    p_threshold: 0.05,
    up_color: "#ff0000",
    x_axis_label: "log2 fold change",
    y_axis_label: "-log10 p-value",
};

describe("classifyPoints", () => {
    const groups = classifyPoints(genes, log2FoldChange, padj, 1, 0.05);

    it("splits features by the fold change and p-value thresholds", () => {
        expect(groups.up.map((point) => point.label)).toEqual(["SLC6A4", "TOP_GENE"]);
        expect(groups.down.map((point) => point.label)).toEqual(["TBX5"]);
        expect(groups.none.map((point) => point.label)).toEqual(["DOK6", "IFITM1", "FLAT"]);
    });

    it("counts a fold change at the threshold as significant and a p-value at the threshold as not", () => {
        const edge = classifyPoints(["AT_FOLD", "AT_P"], [-1, 2], [0.01, 0.05], 1, 0.05);
        expect(edge.down.map((point) => point.label)).toEqual(["AT_FOLD"]);
        expect(edge.none.map((point) => point.label)).toEqual(["AT_P"]);
    });

    it("skips missing values, values outside of 0 to 1 and a header row", () => {
        const skipped = classifyPoints(
            ["Gene", "NA", "HIGH", "NEGATIVE", "OK"],
            ["log2FoldChange", 2, 2, 2, 2],
            ["padj", null, 1.5, -0.1, 0.01],
            1,
            0.05,
        );
        const labels = [...skipped.up, ...skipped.down, ...skipped.none].map((point) => point.label);
        expect(labels).toEqual(["OK"]);
    });

    it("draws a p-value of 0 at the top of the panel", () => {
        const top = groups.up.find((point) => point.label === "TOP_GENE");
        expect(top.p).toBe(0);
        expect(top.score).toBe(groups.maxScore);
        expect(groups.maxScore).toBeCloseTo(-Math.log10(0.0003));
    });

    it("numbers rows when there is no label column", () => {
        const unlabeled = classifyPoints(undefined, [2], [0.01], 1, 0.05);
        expect(unlabeled.up[0].label).toBe("1");
    });
});

describe("topLabels", () => {
    it("labels the most significant up and down features", () => {
        const groups = classifyPoints(genes, log2FoldChange, padj, 1, 0.05);
        expect(topLabels(groups, 2).map((point) => point.label)).toEqual(["TOP_GENE", "TBX5"]);
    });
});

describe("plot", () => {
    beforeEach(() => {
        fetchColumns.mockResolvedValue([
            { label: genes, x: log2FoldChange, y: padj },
            { label: genes, x: log2FoldChange.map((fold) => -fold), y: padj },
        ]);
    });

    it("draws one panel per contrast with the colors from the settings", async () => {
        const tracks = [{ name: "B-A" }, { name: "C-A" }];
        const { data, layout } = await plotlyVolcano("id", settings, tracks);
        expect(layout.grid.columns).toBe(2);
        const titles = layout.annotations.filter((annotation) => !annotation.showarrow);
        expect(titles.map((annotation) => annotation.text)).toEqual(["B-A", "C-A"]);
        const up = data.filter((trace) => trace.name === "up");
        expect(up.map((trace) => trace.marker.color)).toEqual(["#ff0000", "#ff0000"]);
        expect(up.map((trace) => trace.xaxis)).toEqual(["x", "x2"]);
        expect(data.filter((trace) => trace.showlegend).map((trace) => trace.name)).toEqual([
            "not significant",
            "down",
            "up",
        ]);
        expect(layout.xaxis.title.text).toContain("2 up, 1 down");
        expect(layout.xaxis2.title.text).toContain("1 up, 2 down");
    });

    it("labels the most significant features and draws the thresholds", async () => {
        fetchColumns.mockResolvedValue([{ label: genes, x: log2FoldChange, y: padj }]);
        const { data, layout } = await plotlyVolcano("id", settings, [{ name: "B-A" }]);
        expect(layout.annotations.map((annotation) => annotation.text)).toEqual(["TOP_GENE", "TBX5"]);
        const thresholds = data.find((trace) => trace.mode === "lines");
        expect(thresholds.x.slice(0, 5)).toEqual([-1, -1, null, 1, 1]);
        expect(thresholds.y.slice(-2)).toEqual([-Math.log10(0.05), -Math.log10(0.05)]);
    });
});
