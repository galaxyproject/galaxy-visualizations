<script setup lang="ts">
import type { DatasetDetailType, JobDetailType, ReportDataType, VisualizationSpecsType } from "@/types";
import { onMounted, ref } from "vue";
import { ArrowPathIcon, BoltIcon, CheckIcon, ClockIcon, ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import type { ConsoleMessageType } from "@/types";
import Console from "@/components/Console.vue";
import Dashboard from "@/components/Dashboard.vue";

import { PyodideManager, type ProgressEvent } from "@/pyodide/pyodide-manager";
import { runDatasetReport } from "./pyodide-runner";

// Human-readable labels for pipeline steps
const NODE_LABELS: Record<string, string> = {
    fetch_source_dataset: "Fetching source dataset",
    fetch_history_details: "Fetching history details",
    traverse_upstream: "Exploring dataset lineage",
    fetch_citations: "Fetching citations",
    analyze_workflow: "Analyzing",
    generate_methods: "Generating",
    done: "Finalizing report",
};

// Props
const props = defineProps<{
    datasetId: string;
    root: string;
    specs: VisualizationSpecsType;
}>();

// Constants
const PLUGIN_NAME = "polaris";

// Load pyodide
const isDev = (import.meta as any).env.DEV;
const pyodideBaseUrl = isDev ? "" : `static/plugins/visualizations/${PLUGIN_NAME}/`;
const pyodideIndexUrl = `${props.root}${pyodideBaseUrl}static/pyodide`;
const pyodide = new PyodideManager({
    indexURL: pyodideIndexUrl,
    extraPackages: [
        `${pyodideIndexUrl}/polaris-0.0.0-py3-none-any.whl`,
        `${pyodideIndexUrl}/polaris_dataset_report-0.1.0-py3-none-any.whl`,
    ],
});

// References
const consoleMessages = ref<ConsoleMessageType[]>([]);
const loadingStatus = ref<string>("Initializing...");
const reportData = ref<ReportDataType>({
    reportTitle: "",
    datasetDetails: [],
    jobDetails: [],
    markdownContent: "",
    mermaidDiagram: "",
    sourceDatasetId: props.datasetId,
});

// Configuration
function getConfig() {
    return {
        ai_base_url: props.specs.ai_api_base_url || `${props.root}api/plugins/${PLUGIN_NAME}`,
        ai_api_key: props.specs.ai_api_key,
        ai_model: props.specs.ai_model,
        ai_max_tokens: props.specs.ai_max_tokens ? parseInt(props.specs.ai_max_tokens) : undefined,
        ai_temperature: props.specs.ai_temperature ? parseFloat(props.specs.ai_temperature) : undefined,
        ai_top_p: props.specs.ai_top_p ? parseFloat(props.specs.ai_top_p) : undefined,
        galaxy_root: props.root,
    };
}

// Update report data from result or state
function updateReportData(result: any) {
    const datasetDetails: DatasetDetailType[] = result.dataset_details || [];
    const sourceDataset = datasetDetails.find((ds) => ds.id === props.datasetId);
    const reportTitle = sourceDataset?.name || "Dataset Report";
    const jobDetails: JobDetailType[] = result.job_details || [];

    // Build markdown content from available fields
    const parts: string[] = [];
    if (result.selected_history?.annotation) {
        parts.push(`*${result.selected_history.annotation}*`);
    }
    if (result.workflow_analysis) {
        parts.push(result.workflow_analysis);
    }
    if (result.report && result.report !== result.workflow_analysis) {
        parts.push("## Summary\n\n" + result.report);
    }

    // Update report data with all structured information
    reportData.value = {
        reportTitle,
        datasetDetails,
        jobDetails,
        markdownContent: parts.join("\n\n---\n\n"),
        mermaidDiagram: result.mermaid_diagram || "",
        sourceDatasetId: props.datasetId,
    };
}

// Generate report
async function generateReport() {
    const pyodideMessageIndex = consoleMessages.value.length;
    loadingStatus.value = "Loading Pyodide...";
    consoleMessages.value.push({ content: "Loading Pyodide...", icon: ArrowPathIcon, spin: true });
    await pyodide.initialize();
    consoleMessages.value[pyodideMessageIndex] = { content: "Pyodide ready.", icon: CheckIcon };

    try {
        // Track progress message index for each node
        let currentProgressIndex = -1;

        // Set up progress callback
        pyodide.setProgressCallback((event: ProgressEvent) => {
            const label = NODE_LABELS[event.node_id] || event.node_id;

            if (event.status === "started") {
                currentProgressIndex = consoleMessages.value.length;
                loadingStatus.value = `${label}...`;
                consoleMessages.value.push({
                    content: `${label}...`,
                    icon: ArrowPathIcon,
                    spin: true,
                });
            } else if (event.status === "completed" && currentProgressIndex >= 0) {
                consoleMessages.value[currentProgressIndex] = {
                    content: label,
                    icon: CheckIcon,
                };
            } else if (event.status === "failed" && currentProgressIndex >= 0) {
                consoleMessages.value[currentProgressIndex] = {
                    content: `${label} failed`,
                    icon: ExclamationTriangleIcon,
                };
            }
        });

        const config = getConfig();
        const depth = props.specs.depth ? parseInt(props.specs.depth) : 20;
        const maxPerLevel = props.specs.max_per_level ? parseInt(props.specs.max_per_level) : 20;
        const reply = await runDatasetReport(pyodide, config, {
            dataset_id: props.datasetId,
            depth,
            max_per_level: maxPerLevel,
        });
        console.debug("[polaris]", reply);

        // Clear progress callback
        pyodide.setProgressCallback(null);

        // Check for pipeline errors
        if (reply?.last?.ok === false) {
            const error = reply.last.error;
            const errorMsg = error?.message || "Unknown error";
            consoleMessages.value.push({
                content: `Report generation failed: ${errorMsg}`,
                icon: ExclamationTriangleIcon,
            });
            console.error("[polaris] Pipeline error:", error);

            // Still try to show partial results from state if available
            const state = reply?.state;
            if (state?.selected_history || state?.dataset_details?.length) {
                consoleMessages.value.push({
                    content: "Showing partial results...",
                    icon: ClockIcon,
                });
                updateReportData(state);
            }
            return;
        }

        if (reply?.last?.result) {
            consoleMessages.value.push({ content: "Report complete.", icon: BoltIcon });
            updateReportData(reply.last.result);
        } else {
            consoleMessages.value.push({
                content: "Report generation completed but no results returned.",
                icon: ExclamationTriangleIcon,
            });
        }
    } catch (e) {
        pyodide.setProgressCallback(null);
        consoleMessages.value.push({ content: String(e), icon: ExclamationTriangleIcon });
        console.error(e);
    }
}

onMounted(() => {
    generateReport();
});
</script>

<template>
    <div class="flex flex-col h-screen p-1">
        <div class="flex-1 min-h-0 overflow-auto">
            <Dashboard :data="reportData" :loading-status="loadingStatus" />
        </div>
        <Console class="shrink-0 pt-1" :messages="consoleMessages" />
    </div>
</template>
