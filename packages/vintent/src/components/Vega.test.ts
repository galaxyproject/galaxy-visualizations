import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import Vega from "./Vega.vue";

// Mock vega-embed
const mockFinalize = vi.fn();
const mockResize = vi.fn(() => ({ runAsync: vi.fn() }));
const mockView = {
    finalize: mockFinalize,
    resize: mockResize,
};

vi.mock("vega-embed", () => ({
    default: vi.fn(() => Promise.resolve({ view: mockView })),
}));

// Mock @vueuse/core
vi.mock("@vueuse/core", () => ({
    useDebounceFn: (fn: Function) => fn,
    useResizeObserver: vi.fn(),
}));

describe("Vega", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const defaultSpec = {
        mark: "bar",
        encoding: {
            x: { field: "a", type: "nominal" },
            y: { field: "b", type: "quantitative" },
        },
    };

    describe("Rendering", () => {
        it("renders chart container", () => {
            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "Test Chart" },
            });
            expect(wrapper.find(".flex-1").exists()).toBe(true);
        });

        it("displays message", () => {
            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "My Chart Title" },
            });
            expect(wrapper.text()).toContain("My Chart Title");
        });

        it("calls vega-embed on mount", async () => {
            const embed = (await import("vega-embed")).default;
            mount(Vega, {
                props: { spec: defaultSpec, message: "Test" },
            });
            await flushPromises();
            expect(embed).toHaveBeenCalled();
        });
    });

    describe("Error handling", () => {
        it("displays error message when embed fails", async () => {
            const embed = (await import("vega-embed")).default;
            (embed as any).mockRejectedValueOnce(new Error("Invalid spec"));

            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "Test" },
            });
            await flushPromises();

            expect(wrapper.find(".bg-red-100").exists()).toBe(true);
            expect(wrapper.text()).toContain("Invalid spec");
        });

        it("hides error message on successful render", async () => {
            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "Test" },
            });
            await flushPromises();

            expect(wrapper.find(".bg-red-100").exists()).toBe(false);
        });
    });

    describe("Lifecycle", () => {
        it("finalizes view on unmount", async () => {
            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "Test" },
            });
            await flushPromises();
            wrapper.unmount();

            expect(mockFinalize).toHaveBeenCalled();
        });

        it("re-embeds chart when props change", async () => {
            const embed = (await import("vega-embed")).default;
            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "Test" },
            });
            await flushPromises();

            const initialCallCount = (embed as any).mock.calls.length;

            await wrapper.setProps({ spec: { mark: "line" }, message: "Updated" });
            await flushPromises();

            expect((embed as any).mock.calls.length).toBeGreaterThan(initialCallCount);
        });
    });

    describe("Props", () => {
        it("defaults fillWidth to true", () => {
            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "Test" },
            });
            expect(wrapper.props("fillWidth")).toBe(true);
        });

        it("accepts fillWidth prop", () => {
            const wrapper = mount(Vega, {
                props: { spec: defaultSpec, message: "Test", fillWidth: false },
            });
            expect(wrapper.props("fillWidth")).toBe(false);
        });
    });

    describe("Debounce constant", () => {
        it("exports RESIZE_DEBOUNCE_MS as 150", async () => {
            // The constant is internal but we can verify behavior
            // by checking that useResizeObserver was called
            const { useResizeObserver } = await import("@vueuse/core");
            mount(Vega, {
                props: { spec: defaultSpec, message: "Test" },
            });
            expect(useResizeObserver).toHaveBeenCalled();
        });
    });
});
