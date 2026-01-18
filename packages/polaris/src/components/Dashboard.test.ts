import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import Dashboard from "./Dashboard.vue";
import type { ReportDataType, DatasetDetailType, JobDetailType } from "@/types";

// Mock Mermaid component to avoid rendering complexity
vi.mock("./Mermaid.vue", () => ({
    default: {
        name: "Mermaid",
        props: ["code"],
        template: '<div class="mock-mermaid">{{ code }}</div>',
    },
}));

// Helper to create minimal valid props
function createProps(overrides: Partial<ReportDataType> = {}): {
    data: ReportDataType;
    loadingStatus: string;
} {
    return {
        data: {
            reportTitle: "Test Report",
            datasetDetails: [],
            jobDetails: [],
            markdownContent: "",
            mermaidDiagram: "",
            ...overrides,
        },
        loadingStatus: "Loading...",
    };
}

// Helper to create dataset details
function createDataset(overrides: Partial<DatasetDetailType> = {}): DatasetDetailType {
    return {
        id: "ds-1",
        uuid: "uuid-1",
        name: "test.fastq",
        creating_job: "job-1",
        file_ext: "fastq",
        file_size: 1024,
        ...overrides,
    };
}

// Helper to create job details
function createJob(overrides: Partial<JobDetailType> = {}): JobDetailType {
    return {
        id: "job-1",
        tool_id: "toolshed/bwa",
        state: "ok",
        create_time: "2024-01-01T00:00:00",
        inputs: {},
        ...overrides,
    };
}

describe("Dashboard", () => {
    describe("Loading state", () => {
        it("shows loading spinner when no markdown content", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({ markdownContent: "" }),
            });
            expect(wrapper.find(".animate-spin").exists()).toBe(true);
            expect(wrapper.text()).toContain("Loading...");
        });

        it("shows custom loading status message", () => {
            const wrapper = mount(Dashboard, {
                props: {
                    ...createProps({ markdownContent: "" }),
                    loadingStatus: "Analyzing workflow...",
                },
            });
            expect(wrapper.text()).toContain("Analyzing workflow...");
        });

        it("hides loading spinner when content is present", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({ markdownContent: "# Report" }),
            });
            expect(wrapper.find(".animate-spin").exists()).toBe(false);
        });
    });

    describe("Report header", () => {
        it("displays report title", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    reportTitle: "My Dataset Analysis",
                    markdownContent: "content",
                }),
            });
            expect(wrapper.find("h1").text()).toBe("My Dataset Analysis");
        });
    });

    describe("Stats cards", () => {
        it("displays dataset count", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [createDataset({ id: "ds-1" }), createDataset({ id: "ds-2" })],
                }),
            });
            expect(wrapper.text()).toContain("2");
            expect(wrapper.text()).toContain("Datasets");
        });

        it("displays tool count excluding internal tools", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    jobDetails: [
                        createJob({ id: "j1", tool_id: "toolshed/bwa" }),
                        createJob({ id: "j2", tool_id: "toolshed/samtools" }),
                        createJob({ id: "j3", tool_id: "__DATA_FETCH__" }), // Internal - should be excluded
                        createJob({ id: "j4", tool_id: "__SET_METADATA__" }), // Internal - should be excluded
                    ],
                }),
            });
            // Should show 2 (bwa and samtools), not 4
            const toolsCard = wrapper.find(".bg-green-50");
            expect(toolsCard.text()).toContain("2");
            expect(toolsCard.text()).toContain("Tools");
        });

        it("counts unique tools only", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    jobDetails: [
                        createJob({ id: "j1", tool_id: "toolshed/bwa" }),
                        createJob({ id: "j2", tool_id: "toolshed/bwa" }), // Duplicate
                        createJob({ id: "j3", tool_id: "toolshed/samtools" }),
                    ],
                }),
            });
            const toolsCard = wrapper.find(".bg-green-50");
            expect(toolsCard.text()).toContain("2"); // bwa + samtools
        });

        it("displays total size formatted correctly", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [
                        createDataset({ file_size: 1024 }), // 1 KB
                        createDataset({ file_size: 2048 }), // 2 KB
                    ],
                }),
            });
            const sizeCard = wrapper.find(".bg-purple-50");
            expect(sizeCard.text()).toContain("3 KB");
        });

        it("displays top file types", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [
                        createDataset({ file_ext: "fastq" }),
                        createDataset({ file_ext: "fastq" }),
                        createDataset({ file_ext: "bam" }),
                    ],
                }),
            });
            const typesCard = wrapper.find(".bg-amber-50");
            expect(typesCard.text()).toContain("fastq");
            expect(typesCard.text()).toContain("bam");
        });

        it("limits file types to top 4", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [
                        createDataset({ file_ext: "fastq" }),
                        createDataset({ file_ext: "fastq" }),
                        createDataset({ file_ext: "bam" }),
                        createDataset({ file_ext: "vcf" }),
                        createDataset({ file_ext: "bed" }),
                        createDataset({ file_ext: "gff" }), // 5th type - should be excluded
                    ],
                }),
            });
            const typesCard = wrapper.find(".bg-amber-50");
            expect(typesCard.text()).not.toContain("gff");
        });
    });

    describe("formatBytes", () => {
        it("formats zero bytes", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [createDataset({ file_size: 0 })],
                }),
            });
            expect(wrapper.find(".bg-purple-50").text()).toContain("0 B");
        });

        it("formats bytes", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [createDataset({ file_size: 500 })],
                }),
            });
            expect(wrapper.find(".bg-purple-50").text()).toContain("500 B");
        });

        it("formats kilobytes", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [createDataset({ file_size: 1536 })], // 1.5 KB
                }),
            });
            expect(wrapper.find(".bg-purple-50").text()).toContain("1.5 KB");
        });

        it("formats megabytes", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [createDataset({ file_size: 5 * 1024 * 1024 })], // 5 MB
                }),
            });
            expect(wrapper.find(".bg-purple-50").text()).toContain("5 MB");
        });

        it("formats gigabytes", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [createDataset({ file_size: 2.5 * 1024 * 1024 * 1024 })], // 2.5 GB
                }),
            });
            expect(wrapper.find(".bg-purple-50").text()).toContain("2.5 GB");
        });
    });

    describe("API warnings", () => {
        it("shows warning when jobs have missing inputs", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    jobDetails: [
                        createJob({ tool_id: "toolshed/bwa", inputs: undefined }),
                        createJob({ tool_id: "toolshed/samtools", inputs: {} }),
                    ],
                }),
            });
            expect(wrapper.text()).toContain("Failed to fetch inputs for 1 job(s)");
            expect(wrapper.text()).toContain("toolshed/bwa");
        });

        it("excludes internal tools from warnings", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    jobDetails: [createJob({ tool_id: "__DATA_FETCH__", inputs: undefined })],
                }),
            });
            expect(wrapper.find(".bg-amber-50.border-amber-200").exists()).toBe(false);
        });

        it("hides warning section when no issues", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    jobDetails: [createJob({ inputs: {} })],
                }),
            });
            expect(wrapper.find(".bg-amber-50.border-amber-200").exists()).toBe(false);
        });

        it("shows truncation warning when truncated is true", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    truncated: true,
                }),
            });
            expect(wrapper.find(".bg-amber-50.border-amber-200").exists()).toBe(true);
            expect(wrapper.text()).toContain("Results were truncated");
            expect(wrapper.text()).toContain("traversal limits");
        });

        it("does not show truncation warning when truncated is false", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    truncated: false,
                }),
            });
            expect(wrapper.text()).not.toContain("truncated");
        });

        it("does not show truncation warning when truncated is undefined", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                }),
            });
            expect(wrapper.text()).not.toContain("truncated");
        });

        it("shows both truncation and missing inputs warnings", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    truncated: true,
                    jobDetails: [createJob({ tool_id: "toolshed/bwa", inputs: undefined })],
                }),
            });
            const warningSection = wrapper.find(".bg-amber-50.border-amber-200");
            expect(warningSection.exists()).toBe(true);
            expect(wrapper.text()).toContain("Results were truncated");
            expect(wrapper.text()).toContain("Failed to fetch inputs");
        });
    });

    describe("Mermaid diagram", () => {
        it("renders mermaid component when diagram is provided", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    mermaidDiagram: "flowchart LR\n  A --> B",
                }),
            });
            expect(wrapper.find(".mock-mermaid").exists()).toBe(true);
            expect(wrapper.text()).toContain("Data Flow");
        });

        it("hides mermaid section when no diagram", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    mermaidDiagram: "",
                }),
            });
            expect(wrapper.find(".mock-mermaid").exists()).toBe(false);
            expect(wrapper.text()).not.toContain("Data Flow");
        });
    });

    describe("Markdown content", () => {
        it("renders markdown as HTML", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "# Heading\n\nParagraph text",
                }),
            });
            expect(wrapper.find(".prose").exists()).toBe(true);
            expect(wrapper.find("h1").exists()).toBe(true);
            expect(wrapper.text()).toContain("Paragraph text");
        });

        it("renders bold and italic markdown", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "**bold** and *italic*",
                }),
            });
            expect(wrapper.find("strong").text()).toBe("bold");
            expect(wrapper.find("em").text()).toBe("italic");
        });

        it("hides prose section when no content", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "",
                }),
            });
            // When no content, loading is shown instead
            expect(wrapper.find(".prose").exists()).toBe(false);
        });
    });

    describe("Edge cases", () => {
        it("handles empty datasets and jobs", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [],
                    jobDetails: [],
                }),
            });
            expect(wrapper.find(".bg-blue-50").text()).toContain("0");
            expect(wrapper.find(".bg-green-50").text()).toContain("0");
            expect(wrapper.find(".bg-purple-50").text()).toContain("0 B");
        });

        it("handles datasets with missing file_size", () => {
            const wrapper = mount(Dashboard, {
                props: createProps({
                    markdownContent: "content",
                    datasetDetails: [
                        createDataset({ file_size: undefined as unknown as number }),
                        createDataset({ file_size: 1024 }),
                    ],
                }),
            });
            // Should handle undefined gracefully (treated as 0)
            expect(wrapper.find(".bg-purple-50").text()).toContain("1 KB");
        });
    });
});
