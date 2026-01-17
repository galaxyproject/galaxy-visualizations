<script setup lang="ts">
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import Mermaid from "./Mermaid.vue";
import type { ReportDataType } from "@/types";

const props = defineProps<{
    data: ReportDataType;
    loadingStatus: string;
}>();

const md = new MarkdownIt();

// Render markdown content
const contentHtml = computed(() => {
    if (!props.data.markdownContent) return "";
    return md.render(props.data.markdownContent);
});

// Compute stats from dataset details
const stats = computed(() => {
    const datasets = props.data.datasetDetails;
    const jobs = props.data.jobDetails;

    const fileTypes = new Map<string, number>();
    let totalSize = 0;
    for (const ds of datasets) {
        fileTypes.set(ds.file_ext, (fileTypes.get(ds.file_ext) || 0) + 1);
        totalSize += ds.file_size || 0;
    }

    const uniqueTools = new Set(jobs.filter((j) => !j.tool_id.startsWith("__")).map((j) => j.tool_id));
    const topTypes = [...fileTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

    return {
        datasetCount: datasets.length,
        toolCount: uniqueTools.size,
        totalSize: formatBytes(totalSize),
        topFileTypes: topTypes,
    };
});

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const isLoading = computed(() => !props.data.markdownContent);

// Detect jobs with missing input data (likely API permission errors)
const apiWarnings = computed(() => {
    const { jobDetails } = props.data;
    const missingJobs = jobDetails.filter((j) => !j.tool_id.startsWith("__") && !j.inputs).map((j) => j.tool_id);
    return missingJobs.length > 0
        ? [`Failed to fetch inputs for ${missingJobs.length} job(s): ${missingJobs.join(", ")}`]
        : [];
});
</script>

<template>
    <div class="h-full p-4">
        <div v-if="isLoading" class="h-full text-gray-500 flex items-center justify-center gap-2">
            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>{{ loadingStatus }}</span>
        </div>
        <div v-else>
            <!-- API Warnings -->
            <div v-if="apiWarnings.length > 0" class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div class="text-amber-800 text-sm font-medium mb-1">Warning</div>
                <ul class="text-amber-700 text-xs list-disc list-inside">
                    <li v-for="(warning, idx) in apiWarnings" :key="idx">
                        <div>{{ warning }}</div>
                    </li>
                </ul>
            </div>

            <!-- Dataset Report Header -->
            <h1 class="text-2xl font-bold text-gray-800 mb-2">{{ data.reportTitle }}</h1>
            <hr class="border-gray-300 mb-4" />

            <!-- Stats Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div class="bg-blue-50 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-blue-600">{{ stats.datasetCount }}</div>
                    <div class="text-xs text-blue-600">Datasets</div>
                </div>
                <div class="bg-green-50 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-green-600">{{ stats.toolCount }}</div>
                    <div class="text-xs text-green-600">Tools</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-purple-600">{{ stats.totalSize }}</div>
                    <div class="text-xs text-purple-600">Total Size</div>
                </div>
                <div class="bg-amber-50 rounded-lg p-3 text-center">
                    <div class="text-lg font-bold text-amber-600">
                        <span v-for="(type, idx) in stats.topFileTypes" :key="type[0]">
                            {{ type[0] }}<span v-if="idx < stats.topFileTypes.length - 1">, </span>
                        </span>
                    </div>
                    <div class="text-xs text-amber-600">File Types</div>
                </div>
            </div>

            <!-- Data Flow Diagram -->
            <div v-if="data.mermaidDiagram" class="mb-4">
                <h2 class="text-lg font-semibold text-gray-700 mb-2">Data Flow</h2>
                <Mermaid :code="data.mermaidDiagram" />
            </div>

            <!-- Markdown Report Content -->
            <div v-if="contentHtml" class="prose prose-sm max-w-none" v-html="contentHtml" />
        </div>
    </div>
</template>
