import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { VisualizationSpecsType } from "@/types";

// Mock pyodide-runner - must be before Plugin import
const mockRunDatasetReport = vi.fn();
vi.mock("../pyodide-runner", () => ({
    runDatasetReport: (...args: unknown[]) => mockRunDatasetReport(...args),
}));

// Mock PyodideManager - factory must be self-contained
vi.mock("@/pyodide/pyodide-manager", () => {
    return {
        PyodideManager: class {
            initialize = vi.fn().mockResolvedValue(undefined);
            setProgressCallback = vi.fn();
            runPythonAsync = vi.fn();
        },
    };
});

// Import after mocks are set up
import Plugin from "../Plugin.vue";

// Mock Dashboard and Console components
vi.mock("@/components/Dashboard.vue", () => ({
    default: {
        name: "Dashboard",
        props: ["data", "loadingStatus"],
        template: '<div class="mock-dashboard" :data-truncated="data.truncated">{{ JSON.stringify(data) }}</div>',
    },
}));

vi.mock("@/components/Console.vue", () => ({
    default: {
        name: "Console",
        props: ["messages"],
        template: '<div class="mock-console">{{ messages.length }} messages</div>',
    },
}));

// Helper to create props
function createProps(overrides: Partial<VisualizationSpecsType> = {}) {
    return {
        datasetId: "test-dataset-123",
        root: "http://localhost:8080/",
        specs: {
            ai_api_base_url: "http://localhost:11434/v1/",
            ai_api_key: "test-key",
            ai_model: "gpt-4",
            depth: "10",
            max_per_level: "5",
            ...overrides,
        },
    };
}

describe("Plugin", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("updateReportData", () => {
        it("passes truncated flag to Dashboard when true", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [{ id: "ds-1", name: "test.fastq" }],
                        job_details: [],
                        mermaid_diagram: "",
                        truncated: true,
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboard = wrapper.find(".mock-dashboard");
            expect(dashboard.attributes("data-truncated")).toBe("true");
        });

        it("passes truncated flag to Dashboard when false", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [{ id: "ds-1", name: "test.fastq" }],
                        job_details: [],
                        mermaid_diagram: "",
                        truncated: false,
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboard = wrapper.find(".mock-dashboard");
            expect(dashboard.attributes("data-truncated")).toBe("false");
        });

        it("handles missing truncated flag gracefully", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [],
                        job_details: [],
                        mermaid_diagram: "",
                        // truncated not provided
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            // Should not throw error
            expect(wrapper.find(".mock-dashboard").exists()).toBe(true);
        });

        it("extracts report title from source dataset name", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [
                            { id: "other-ds", name: "other.bam" },
                            { id: "test-dataset-123", name: "my-analysis.fastq" },
                        ],
                        job_details: [],
                        mermaid_diagram: "",
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboardData = JSON.parse(wrapper.find(".mock-dashboard").text());
            expect(dashboardData.reportTitle).toBe("my-analysis.fastq");
        });

        it("uses default title when source dataset not found", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [{ id: "different-id", name: "other.bam" }],
                        job_details: [],
                        mermaid_diagram: "",
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboardData = JSON.parse(wrapper.find(".mock-dashboard").text());
            expect(dashboardData.reportTitle).toBe("Dataset Report");
        });

        it("builds markdown content from workflow_analysis and report", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [],
                        job_details: [],
                        mermaid_diagram: "",
                        workflow_analysis: "This workflow does X",
                        report: "Methods section here",
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboardData = JSON.parse(wrapper.find(".mock-dashboard").text());
            expect(dashboardData.markdownContent).toContain("This workflow does X");
            expect(dashboardData.markdownContent).toContain("Methods section here");
        });

        it("includes history annotation in markdown content", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [],
                        job_details: [],
                        mermaid_diagram: "",
                        selected_history: {
                            annotation: "RNA-seq analysis pipeline",
                        },
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboardData = JSON.parse(wrapper.find(".mock-dashboard").text());
            expect(dashboardData.markdownContent).toContain("RNA-seq analysis pipeline");
        });

        it("passes mermaid diagram to Dashboard", async () => {
            const mermaidCode = "flowchart LR\n  A --> B";
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [],
                        job_details: [],
                        mermaid_diagram: mermaidCode,
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboardData = JSON.parse(wrapper.find(".mock-dashboard").text());
            expect(dashboardData.mermaidDiagram).toBe(mermaidCode);
        });
    });

    describe("config generation", () => {
        it("passes depth and max_per_level from specs", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: { ok: true, result: { dataset_details: [], job_details: [], mermaid_diagram: "" } },
            });

            mount(Plugin, {
                props: createProps({ depth: "15", max_per_level: "8" }),
            });
            await flushPromises();

            expect(mockRunDatasetReport).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    depth: 15,
                    max_per_level: 8,
                })
            );
        });

        it("uses default depth and max_per_level when not specified", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: { ok: true, result: { dataset_details: [], job_details: [], mermaid_diagram: "" } },
            });

            mount(Plugin, {
                props: {
                    datasetId: "test-ds",
                    root: "http://localhost/",
                    specs: {},
                },
            });
            await flushPromises();

            expect(mockRunDatasetReport).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    depth: 20,
                    max_per_level: 20,
                })
            );
        });

        it("passes dataset_id to runner", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: { ok: true, result: { dataset_details: [], job_details: [], mermaid_diagram: "" } },
            });

            mount(Plugin, { props: createProps() });
            await flushPromises();

            expect(mockRunDatasetReport).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    dataset_id: "test-dataset-123",
                })
            );
        });
    });

    describe("error handling", () => {
        it("shows partial results on pipeline failure", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: false,
                    error: { message: "LLM API error" },
                },
                state: {
                    dataset_details: [{ id: "ds-1", name: "partial.fastq" }],
                    job_details: [],
                    selected_history: { name: "Test History" },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            // Should still render dashboard with partial data
            const dashboardData = JSON.parse(wrapper.find(".mock-dashboard").text());
            expect(dashboardData.datasetDetails.length).toBe(1);
        });

        it("handles complete failure gracefully", async () => {
            mockRunDatasetReport.mockRejectedValue(new Error("Pyodide crashed"));

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            // Should show error in console
            expect(wrapper.find(".mock-console").text()).toContain("messages");
        });
    });

    describe("sourceDatasetId", () => {
        it("passes sourceDatasetId to Dashboard", async () => {
            mockRunDatasetReport.mockResolvedValue({
                last: {
                    ok: true,
                    result: {
                        dataset_details: [],
                        job_details: [],
                        mermaid_diagram: "",
                    },
                },
            });

            const wrapper = mount(Plugin, { props: createProps() });
            await flushPromises();

            const dashboardData = JSON.parse(wrapper.find(".mock-dashboard").text());
            expect(dashboardData.sourceDatasetId).toBe("test-dataset-123");
        });
    });
});
