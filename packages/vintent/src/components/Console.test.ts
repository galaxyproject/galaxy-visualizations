import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { markRaw } from "vue";
import Console from "./Console.vue";

// Mock icon component (markRaw prevents Vue reactivity warnings)
const MockIcon = markRaw({ template: "<svg></svg>" });

describe("Console", () => {
    describe("Message display", () => {
        it("renders nothing when no messages", () => {
            const wrapper = mount(Console, {
                props: { messages: [] },
            });
            expect(wrapper.find("div").exists()).toBe(false);
        });

        it("displays message content", () => {
            const wrapper = mount(Console, {
                props: {
                    messages: [{ content: "Hello World", icon: MockIcon }],
                },
            });
            expect(wrapper.text()).toContain("Hello World");
        });

        it("displays multiple messages when expanded", async () => {
            const wrapper = mount(Console, {
                props: {
                    messages: [
                        { content: "Message 1", icon: MockIcon },
                        { content: "Message 2", icon: MockIcon },
                        { content: "Message 3", icon: MockIcon },
                    ],
                },
            });
            // Expand by clicking button
            await wrapper.find("button").trigger("click");
            expect(wrapper.text()).toContain("Message 1");
            expect(wrapper.text()).toContain("Message 2");
            expect(wrapper.text()).toContain("Message 3");
        });

        it("shows only last message when collapsed", () => {
            const wrapper = mount(Console, {
                props: {
                    messages: [
                        { content: "First", icon: MockIcon },
                        { content: "Last", icon: MockIcon },
                    ],
                },
            });
            // Default is collapsed
            expect(wrapper.text()).toContain("Last");
            expect(wrapper.text()).not.toContain("First");
        });
    });

    describe("Collapse toggle", () => {
        it("starts collapsed by default", () => {
            const wrapper = mount(Console, {
                props: {
                    messages: [{ content: "Test", icon: MockIcon }],
                },
            });
            // ChevronDoubleUpIcon is shown when collapsed
            expect(wrapper.find(".h-auto").exists()).toBe(true);
        });

        it("toggles collapse state on button click", async () => {
            const wrapper = mount(Console, {
                props: {
                    messages: [
                        { content: "Message 1", icon: MockIcon },
                        { content: "Message 2", icon: MockIcon },
                    ],
                },
            });
            // Initially collapsed - only last message visible
            expect(wrapper.text()).not.toContain("Message 1");

            // Click to expand
            await wrapper.find("button").trigger("click");
            expect(wrapper.text()).toContain("Message 1");
            expect(wrapper.text()).toContain("Message 2");

            // Click to collapse again
            await wrapper.find("button").trigger("click");
            expect(wrapper.text()).not.toContain("Message 1");
        });
    });

    describe("Content truncation", () => {
        it("truncates long content when collapsed", () => {
            const longContent = "x".repeat(1500);
            const wrapper = mount(Console, {
                props: {
                    messages: [{ content: longContent, icon: MockIcon }],
                },
            });
            const displayed = wrapper.find("span").text();
            expect(displayed.length).toBeLessThan(longContent.length);
            expect(displayed).toContain("...");
        });

        it("shows full content when expanded", async () => {
            const longContent = "x".repeat(1500);
            const wrapper = mount(Console, {
                props: {
                    messages: [{ content: longContent, icon: MockIcon }],
                },
            });
            await wrapper.find("button").trigger("click");
            const displayed = wrapper.find("span").text();
            expect(displayed).toBe(longContent);
        });
    });

    describe("Icon rendering", () => {
        it("renders icon component", () => {
            const wrapper = mount(Console, {
                props: {
                    messages: [{ content: "Test", icon: MockIcon }],
                },
            });
            expect(wrapper.find("svg").exists()).toBe(true);
        });

        it("applies spin class when spin is true", () => {
            const wrapper = mount(Console, {
                props: {
                    messages: [{ content: "Loading", icon: MockIcon, spin: true }],
                },
            });
            expect(wrapper.find(".animate-spin").exists()).toBe(true);
        });
    });
});
