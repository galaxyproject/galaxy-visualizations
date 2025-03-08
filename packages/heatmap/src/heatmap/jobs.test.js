import { buildToolDict } from "./jobs.js";

const tracks = [
    {
        x: 1,
        y: 2,
        z: "3",
    },
    {
        x: 4,
        y: 5,
        z: "6",
    },
];

test("to tool dictionary conversion", () => {
    expect(buildToolDict("heatmap", "dataset_id", tracks)).toEqual({
        inputs: {
            columns: "x_0:2, y_0:3, z_0:4, x_1:5, y_1:6, z_1:7",
            input: {
                id: "dataset_id",
                src: "hda",
            },
            module: "heatmap",
        },
        tool_id: "toolshed.g2.bx.psu.edu/repos/iuc/charts/charts/1.0.1",
    });
});
