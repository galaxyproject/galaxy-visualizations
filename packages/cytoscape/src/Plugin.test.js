import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import Plugin from "./Plugin.vue";
import "./__snapshots__/HTMLCanvasElement.js";

const content = {
    data: {
        format_version: "1.0",
        generated_by: "cytoscape-3.1.1",
        elements: {
            nodes: [{ data: { id: "n0", name: "node0" } }, { data: { id: "n1", name: "node1" } }],
            edges: [{ data: { source: "n0", target: "n1" } }],
        },
        data: {
            name: "mock",
        },
    },
};

vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => content,
});

describe("Plugin", () => {
    it("should render correctly", async () => {
        const mountPoint = document.createElement("div");
        document.body.appendChild(mountPoint);
        const wrapper = mount(Plugin, {
            attachTo: mountPoint,
            props: {
                root: "/",
                datasetId: "MY_DATASET_ID",
                datasetUrl: "MY_DATASET_URL",
                settings: {
                    curve_style: "haystack",
                    layout_name: "preset",
                    directed: false,
                    search_algorithm: undefined,
                    graph_traversal: undefined,
                    color_picker_nodes: "#548DB8",
                    color_picker_edges: "#A5A5A5",
                    color_picker_highlighted: "#C00000",
                },
            },
        });
        await flushPromises();
        await wrapper.vm.$nextTick();
        const html = document.body.innerHTML.replace(/__file=".*\/packages/g, '__file="<root>/packages');
        expect(html).toMatchSnapshot();
    });
});
