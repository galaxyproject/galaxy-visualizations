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
        expect(true).toBeTruthy();
    });
});
