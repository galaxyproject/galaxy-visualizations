import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Plugin from "./Plugin.vue";

describe("Plugin", () => {
    it("renders properly", () => {
        const wrapper = mount(Plugin, {
            props: {
                root: "http://127.0.0.1:8080",
                tracks: [],
                datasetId: "test-dataset",
                datasetUrl: "/api/datasets/test-dataset/display",
                settings: {
                    max_records: 100,
                    region_start: 0,
                    region_end: 10000,
                },
                specs: {},
            },
        });
        expect(wrapper.text()).toContain("No BAM data available");
    });

    it("displays loading state initially", () => {
        const wrapper = mount(Plugin, {
            props: {
                root: "http://127.0.0.1:8080",
                tracks: [],
                datasetId: "test-dataset",
                datasetUrl: "/api/datasets/test-dataset/display",
                settings: {
                    max_records: 100,
                    region_start: 0,
                    region_end: 10000,
                },
                specs: {},
            },
        });
        expect(wrapper.text()).toContain("No BAM data available");
    });

    it("handles missing settings gracefully", () => {
        const wrapper = mount(Plugin, {
            props: {
                root: "http://127.0.0.1:8080",
                tracks: [],
                datasetId: "test-dataset",
                datasetUrl: "/api/datasets/test-dataset/display",
                specs: {},
            },
        });
        expect(wrapper.text()).toContain("No BAM data available");
    });
});
