import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import Mermaid from "./Mermaid.vue";

// Mock mermaid library
const mockRender = vi.fn();
const mockInitialize = vi.fn();
vi.mock("mermaid", () => ({
    default: {
        initialize: (...args: unknown[]) => mockInitialize(...args),
        render: (...args: unknown[]) => mockRender(...args),
    },
}));

// Mock svg-pan-zoom library
const mockDestroy = vi.fn();
const mockSvgPanZoom = vi.fn(() => ({
    destroy: mockDestroy,
}));
vi.mock("svg-pan-zoom", () => ({
    default: (...args: unknown[]) => mockSvgPanZoom(...args),
}));

describe("Mermaid", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default successful render
        mockRender.mockResolvedValue({ svg: '<svg class="test-svg"></svg>' });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Initialization", () => {
        it("initializes mermaid on mount", () => {
            mount(Mermaid, {
                props: { code: "" },
            });
            expect(mockInitialize).toHaveBeenCalledWith(
                expect.objectContaining({
                    startOnLoad: false,
                    theme: "neutral",
                })
            );
        });

        it("configures flowchart settings", () => {
            mount(Mermaid, {
                props: { code: "" },
            });
            expect(mockInitialize).toHaveBeenCalledWith(
                expect.objectContaining({
                    flowchart: expect.objectContaining({
                        useMaxWidth: true,
                        htmlLabels: true,
                        curve: "basis",
                    }),
                })
            );
        });

        it("sets theme variables", () => {
            mount(Mermaid, {
                props: { code: "" },
            });
            expect(mockInitialize).toHaveBeenCalledWith(
                expect.objectContaining({
                    themeVariables: { fontSize: "11px" },
                })
            );
        });
    });

    describe("Rendering", () => {
        it("renders mermaid diagram when code is provided", async () => {
            const wrapper = mount(Mermaid, {
                props: { code: "flowchart LR\n  A --> B" },
            });
            await flushPromises();

            expect(mockRender).toHaveBeenCalledWith(
                expect.stringMatching(/^mermaid-\d+$/),
                "flowchart LR\n  A --> B"
            );
            expect(wrapper.find(".mermaid-container").html()).toContain("test-svg");
        });

        it("does not render when code is empty", async () => {
            mount(Mermaid, {
                props: { code: "" },
            });
            await flushPromises();

            expect(mockRender).not.toHaveBeenCalled();
        });

        it("re-renders when code prop changes", async () => {
            const wrapper = mount(Mermaid, {
                props: { code: "flowchart LR\n  A --> B" },
            });
            await flushPromises();
            expect(mockRender).toHaveBeenCalledTimes(1);

            await wrapper.setProps({ code: "flowchart TD\n  C --> D" });
            await flushPromises();

            expect(mockRender).toHaveBeenCalledTimes(2);
            expect(mockRender).toHaveBeenLastCalledWith(
                expect.stringMatching(/^mermaid-\d+$/),
                "flowchart TD\n  C --> D"
            );
        });

        it("generates unique IDs for each render", async () => {
            const wrapper = mount(Mermaid, {
                props: { code: "flowchart LR\n  A --> B" },
            });
            await flushPromises();

            const firstCallId = mockRender.mock.calls[0][0];

            // Wait a bit to ensure Date.now() changes
            await new Promise((resolve) => setTimeout(resolve, 5));
            await wrapper.setProps({ code: "flowchart TD\n  C --> D" });
            await flushPromises();

            const secondCallId = mockRender.mock.calls[1][0];
            expect(firstCallId).not.toBe(secondCallId);
        });
    });

    describe("Pan/Zoom", () => {
        it("initializes svg-pan-zoom after rendering", async () => {
            mount(Mermaid, {
                props: { code: "flowchart LR\n  A --> B" },
            });
            await flushPromises();

            expect(mockSvgPanZoom).toHaveBeenCalledWith(
                expect.any(Object), // SVG element
                expect.objectContaining({
                    zoomEnabled: true,
                    controlIconsEnabled: true,
                    fit: true,
                    center: true,
                    minZoom: 0.1,
                    maxZoom: 10,
                })
            );
        });

        it("destroys previous pan-zoom instance before re-render", async () => {
            const wrapper = mount(Mermaid, {
                props: { code: "flowchart LR\n  A --> B" },
            });
            await flushPromises();

            await wrapper.setProps({ code: "flowchart TD\n  C --> D" });
            await flushPromises();

            expect(mockDestroy).toHaveBeenCalled();
        });

        it("destroys pan-zoom instance on unmount", async () => {
            const wrapper = mount(Mermaid, {
                props: { code: "flowchart LR\n  A --> B" },
            });
            await flushPromises();

            wrapper.unmount();
            expect(mockDestroy).toHaveBeenCalled();
        });
    });

    describe("Error handling", () => {
        it("displays error message on render failure", async () => {
            const error = new Error("Invalid syntax");
            mockRender.mockRejectedValueOnce(error);

            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            const wrapper = mount(Mermaid, {
                props: { code: "invalid mermaid code" },
            });
            await flushPromises();

            expect(wrapper.find("pre.text-red-500").exists()).toBe(true);
            expect(wrapper.text()).toContain("Invalid syntax");
            expect(consoleSpy).toHaveBeenCalledWith("Mermaid render error:", error);

            consoleSpy.mockRestore();
        });

        it("does not initialize pan-zoom on error", async () => {
            mockRender.mockRejectedValueOnce(new Error("Syntax error"));
            vi.spyOn(console, "error").mockImplementation(() => {});

            mount(Mermaid, {
                props: { code: "invalid" },
            });
            await flushPromises();

            // Pan-zoom should not be called because render failed
            expect(mockSvgPanZoom).not.toHaveBeenCalled();
        });
    });

    describe("UI elements", () => {
        it("renders container with correct classes", () => {
            const wrapper = mount(Mermaid, {
                props: { code: "" },
            });
            const container = wrapper.find(".mermaid-container");
            expect(container.exists()).toBe(true);
            expect(container.classes()).toContain("border");
            expect(container.classes()).toContain("rounded-lg");
            expect(container.classes()).toContain("bg-white");
            expect(container.classes()).toContain("h-96");
        });

        it("displays help text for zoom/pan", () => {
            const wrapper = mount(Mermaid, {
                props: { code: "" },
            });
            expect(wrapper.text()).toContain("Scroll to zoom, drag to pan");
        });
    });
});
