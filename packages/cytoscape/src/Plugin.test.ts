import axios from "axios";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import Plugin from "./Plugin.vue";

const mockGetResponse = {
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

vi.spyOn(axios, "get").mockResolvedValue(mockGetResponse);

describe("Plugin", () => {
    it("should render correctly", () => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => {
            return {
                fillRect: vi.fn(),
                clearRect: vi.fn(),
                getImageData: vi.fn(() => {
                    return {
                        data: new Array(100).fill(0),
                    };
                }),
                putImageData: vi.fn(),
                createImageData: vi.fn(() => {
                    return {
                        data: new Array(100).fill(0),
                    };
                }),
                setTransform: vi.fn(),
                drawImage: vi.fn(),
                save: vi.fn(),
                fillText: vi.fn(),
                restore: vi.fn(),
                measureText: vi.fn(() => {
                    return { width: 0 };
                }),
            };
        });

        const wrapper = mount(Plugin, {
            props: {
                root: "/",
                tracks: [],
                credentials: "include",
                datasetId: "MY_DATASET_ID",
                datasetUrl: "network.json",
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

        expect(wrapper).toMatchSnapshot();
    });
});
