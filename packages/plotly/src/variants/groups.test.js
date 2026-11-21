import { beforeEach, describe, expect, it, vi } from "vitest";
import COLOR_SCHEMES from "@/colors.json";

const fetchColumns = vi.fn();
vi.mock("galaxy-charts", () => ({ useColumnsStore: () => ({ fetchColumns }) }));
vi.mock("@/describeDataset", () => ({ fetchDataStartOffset: async () => 0, sliceColumns: () => {} }));

const { groupColors, groupPoints, default: plotlyGroups } = await import("@/variants/groups");

const species = ["Species", "setosa", "virginica", "setosa", "versicolor"];
const petalLength = ["PetalLengthCm", 1.4, 6.0, 1.3, 4.7];
const petalWidth = ["PetalWidthCm", 0.2, 2.5, 0.2, 1.4];
const sepalLength = ["SepalLengthCm", 5.1, 6.3, 4.7, 7.0];
const sepalWidth = ["SepalWidthCm", 3.5, 3.3, 3.2, 3.2];

const settings = {
    colorschema: "classic",
    equal_axes: false,
    point_size: 4,
    x_axis_label: "length",
    y_axis_label: "width",
};

describe("groupPoints", () => {
    it("splits points by group and skips a header row and missing coordinates", () => {
        const byGroup = groupPoints([...species, "setosa"], [...petalLength, null], [...petalWidth, ""]);
        expect([...byGroup.keys()]).toEqual(["setosa", "virginica", "versicolor"]);
        expect(byGroup.get("setosa")).toEqual({ x: [1.4, 1.3], y: [0.2, 0.2] });
    });

    it("treats numeric group values as groups", () => {
        const byGroup = groupPoints([0, 1, 0], [1, 2, 3], [4, 5, 6]);
        expect([...byGroup.keys()]).toEqual(["0", "1"]);
    });
});

describe("groupColors", () => {
    it("orders groups naturally and assigns the scheme's colors", () => {
        const colors = groupColors(["10", "2", "1", "2"], "classic");
        expect([...colors.keys()]).toEqual(["1", "2", "10"]);
        expect([...colors.values()]).toEqual(COLOR_SCHEMES.classic.slice(0, 3));
    });
});

describe("plot", () => {
    beforeEach(() => {
        fetchColumns.mockResolvedValue([
            { group: species, x: petalLength, y: petalWidth },
            { group: species, x: sepalLength, y: sepalWidth },
        ]);
    });

    it("gives a group the same color in every panel and one legend entry", async () => {
        const { data, layout } = await plotlyGroups("id", settings, [{ name: "Petals" }, { name: "Sepals" }]);
        const setosa = data.filter((trace) => trace.legendgroup === "setosa");
        expect(setosa.map((trace) => trace.xaxis)).toEqual(["x", "x2"]);
        expect(new Set(setosa.map((trace) => trace.marker.color)).size).toBe(1);
        expect(setosa.map((trace) => trace.showlegend)).toEqual([true, false]);
        expect(data.filter((trace) => trace.showlegend).map((trace) => trace.name)).toEqual([
            "setosa",
            "versicolor",
            "virginica",
        ]);
        expect(layout.annotations.map((annotation) => annotation.text)).toEqual(["Petals", "Sepals"]);
        expect(data.every((trace) => trace.type === "scattergl")).toBe(true);
    });

    it("shows point counts and no panel title for a single panel", async () => {
        fetchColumns.mockResolvedValue([{ group: species, x: petalLength, y: petalWidth }]);
        const { data, layout } = await plotlyGroups("id", settings, [{ name: "Petals" }]);
        expect(data.map((trace) => trace.name)).toEqual(["setosa (2)", "versicolor (1)", "virginica (1)"]);
        expect(layout.annotations).toEqual([]);
    });

    it("draws each panel as one series until a group column is chosen", async () => {
        fetchColumns.mockResolvedValue([
            { x: petalLength, y: petalWidth },
            { x: sepalLength, y: sepalWidth },
        ]);
        const { data } = await plotlyGroups("id", settings, [{ name: "Petals" }, { name: "Sepals" }]);
        expect(data.map((trace) => [trace.name, trace.x.length])).toEqual([
            ["Petals", 4],
            ["Sepals", 4],
        ]);
    });

    it("keeps the axis scales independent unless equal axes are requested", async () => {
        const tracks = [{ name: "Petals" }, { name: "Sepals" }];
        const independent = await plotlyGroups("id", settings, tracks);
        expect(independent.layout.yaxis.scaleanchor).toBeUndefined();
        const equal = await plotlyGroups("id", { ...settings, equal_axes: true }, tracks);
        expect([equal.layout.yaxis.scaleanchor, equal.layout.yaxis2.scaleanchor]).toEqual(["x", "x2"]);
    });
});
