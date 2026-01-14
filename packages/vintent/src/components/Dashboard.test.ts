import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import Dashboard from "./Dashboard.vue";

// Mock the Vega component
vi.mock("./Vega.vue", () => ({
    default: {
        name: "Vega",
        template: '<div class="mock-vega">{{ message }}</div>',
        props: ["spec", "message"],
    },
}));

describe("Dashboard", () => {
    const createWidget = (message: string) => ({
        spec: { mark: "bar" },
        message,
    });

    describe("Grid layout", () => {
        it("calculates 1 column for 1 widget", () => {
            const wrapper = mount(Dashboard, {
                props: { widgets: [createWidget("Chart 1")] },
            });
            const grid = wrapper.find("[style]");
            expect(grid.attributes("style")).toContain("repeat(1,");
        });

        it("calculates 2 columns for 2-4 widgets", () => {
            const wrapper = mount(Dashboard, {
                props: {
                    widgets: [createWidget("1"), createWidget("2"), createWidget("3")],
                },
            });
            const grid = wrapper.find("[style]");
            expect(grid.attributes("style")).toContain("repeat(2,");
        });

        it("calculates 3 columns for 5-9 widgets", () => {
            const widgets = Array.from({ length: 9 }, (_, i) => createWidget(`${i}`));
            const wrapper = mount(Dashboard, {
                props: { widgets },
            });
            const grid = wrapper.find("[style]");
            expect(grid.attributes("style")).toContain("repeat(3,");
        });

        it("calculates 4 columns for 10-16 widgets", () => {
            const widgets = Array.from({ length: 16 }, (_, i) => createWidget(`${i}`));
            const wrapper = mount(Dashboard, {
                props: { widgets },
            });
            const grid = wrapper.find("[style]");
            expect(grid.attributes("style")).toContain("repeat(4,");
        });

        it("returns 1 column for empty widgets", () => {
            const wrapper = mount(Dashboard, {
                props: { widgets: [] },
            });
            const grid = wrapper.find("[style]");
            expect(grid.attributes("style")).toContain("repeat(1,");
        });
    });

    describe("Widget rendering", () => {
        it("renders correct number of widgets", () => {
            const widgets = [createWidget("A"), createWidget("B"), createWidget("C")];
            const wrapper = mount(Dashboard, {
                props: { widgets },
            });
            const vegaComponents = wrapper.findAll(".mock-vega");
            expect(vegaComponents.length).toBe(3);
        });

        it("passes spec and message to Vega component", () => {
            const wrapper = mount(Dashboard, {
                props: { widgets: [createWidget("Test Message")] },
            });
            expect(wrapper.text()).toContain("Test Message");
        });
    });

    describe("Widget removal", () => {
        it("emits remove event with widget index on X click", async () => {
            const widgets = [createWidget("A"), createWidget("B")];
            const wrapper = mount(Dashboard, {
                props: { widgets },
            });
            const buttons = wrapper.findAll("button");
            await buttons[1].trigger("click"); // Click second X button
            expect(wrapper.emitted("remove")).toBeTruthy();
            expect(wrapper.emitted("remove")![0]).toEqual([1]);
        });

        it("renders remove button for each widget", () => {
            const widgets = [createWidget("A"), createWidget("B"), createWidget("C")];
            const wrapper = mount(Dashboard, {
                props: { widgets },
            });
            const buttons = wrapper.findAll("button");
            expect(buttons.length).toBe(3);
        });
    });
});
