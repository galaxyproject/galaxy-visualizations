import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import Plugin from "./Plugin.vue";

// Mock the @gmod/bam module to avoid ES module issues in tests
vi.mock("@gmod/bam", () => ({
    BamFile: vi.fn(() => ({
        getHeader: vi.fn().mockResolvedValue({
            version: "1.6",
            sortOrder: "coordinate",
            references: [
                { name: "chr7", length: 159138663 },
                { name: "chrM", length: 16569 },
            ],
            readGroups: [],
            programs: [],
        }),
        getRecordsForRange: vi.fn().mockResolvedValue([
            {
                name: "test_read_1",
                refName: "chr7",
                start: 1000,
                end: 1050,
                cigar: "50M",
                seq: "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC",
                qual: "JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ",
                flags: 99,
                mapq: 60,
                tags: { AS: 50, XS: 10, NM: 0, MD: "50" },
            },
        ]),
    })),
}));

describe("Plugin", () => {
    it("renders properly with mock data", async () => {
        const wrapper = mount(Plugin, {
            props: {
                root: "http://127.0.0.1:8080",
                tracks: [],
                datasetId: "test-dataset",
                datasetUrl: "mock://test.bam",
                settings: {
                    max_records: 100,
                    region_start: 0,
                    region_end: 10000,
                },
                specs: {},
            },
        });

        // Wait for the component to finish loading
        await wrapper.vm.$nextTick();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(wrapper.text()).toContain("BAM Header Information");
    });

    it("displays no data message for invalid URLs", () => {
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

    it("handles missing settings gracefully", async () => {
        const wrapper = mount(Plugin, {
            props: {
                root: "http://127.0.0.1:8080",
                tracks: [],
                datasetId: "test-dataset",
                datasetUrl: "mock://test.bam",
                specs: {},
            },
        });

        // Wait for the component to finish loading
        await wrapper.vm.$nextTick();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(wrapper.text()).toContain("BAM Header Information");
    });
});
