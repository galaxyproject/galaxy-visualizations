import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import Plugin from "@/Plugin.vue";

import "@/__snapshots__/HTMLCanvasElement.js";

const content =
    "((raccoon:19.19959,bear:6.80041):0.84600,((sea_lion:11.99700, seal:12.00300):7.52973,((monkey:100.85930,cat:47.14069):20.59201, weasel:18.87953):2.09460):3.87382,dog:25.46154);";

vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    text: async () => content,
});

describe("Plugin", () => {
    it("should render correctly", () => {
        const wrapper = mount(Plugin, {
            props: {
                datasetId: "MY_DATASET_ID",
                datasetUrl: "phylocanvas.nwk",
                root: "/",
                settings: {},
                tracks: [],
            },
        });

        expect(wrapper).toMatchSnapshot();
    });
});
