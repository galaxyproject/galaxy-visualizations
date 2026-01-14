<script setup lang="ts">
import { type InputValuesType, type TranscriptMessageType } from "galaxy-charts";
import { onMounted, onUnmounted, ref, watch } from "vue";
import {
    AcademicCapIcon,
    ArrowPathIcon,
    BoltIcon,
    CheckIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
} from "@heroicons/vue/24/outline";
import { PyodideManager } from "@/pyodide/pyodide-manager";
import Console from "@/components/Console.vue";
import Dashboard from "@/components/Dashboard.vue";
import Tabular from "@/components/Tabular.vue";
import type { ConsoleMessageType } from "@/types";

import { runVintent } from "./pyodide-runner";

// Props
const props = defineProps<{
    datasetId: string;
    root: string;
    settings: {
        ai_pipeline_combine?: false;
        widgets?: [];
    };
    specs: {
        ai_api_base_url?: string;
        ai_api_key?: string;
        ai_max_tokens?: string;
        ai_model?: string;
        ai_prompt?: string;
        ai_temperature?: string;
        ai_top_p?: string;
        ai_contract?: any;
    };
    transcripts: TranscriptMessageType[];
}>();

// Emits
const emit = defineEmits<{
    (event: "update", newSettings: InputValuesType): void;
}>();

// Constants
const DATASET_NAME = "dataset.txt";
const MESSAGE_INITIAL = "Hi! I can create visualizations for your data.";
const MESSAGE_FAILED = "I failed to complete your request.";
const MESSAGE_SUCCESS = "Successfully produced output.";
const PROMPT_DEFAULT = "How can I help you?";
const PLUGIN_NAME = "vintent";
const TEST_DATA = "test-data/dataset.csv";

// Dataset URL
const isTestData = props.datasetId === "__test__";
const datasetUrl = isTestData ? TEST_DATA : `${props.root}api/datasets/${props.datasetId}/display`;

// Load pyodide
const isDev = (import.meta as any).env.DEV;
const pyodideBaseUrl = isDev ? "" : `static/plugins/visualizations/${PLUGIN_NAME}/`;
const pyodideIndexUrl = `${props.root}${pyodideBaseUrl}static/pyodide`;
const pyodide = new PyodideManager({
    indexURL: pyodideIndexUrl,
    extraPackages: [`${pyodideIndexUrl}/vintent-0.0.0-py3-none-any.whl`],
});

// References
const datasetContent = ref<string>();
const consoleMessages = ref<ConsoleMessageType[]>([]);
const isLoadingPyodide = ref<boolean>(true);
const isProcessingRequest = ref<boolean>(false);
const widgets = ref<any>(props.settings?.widgets ?? []);

// Configuration
function getConfig() {
    return {
        ai_base_url: props.specs.ai_api_base_url || `${props.root}api/plugins/${PLUGIN_NAME}`,
        ai_api_key: props.specs.ai_api_key,
        ai_model: props.specs.ai_model,
        ai_pipeline_combine: props.settings.ai_pipeline_combine,
    };
}

// Load dataset content
async function loadDataset(): Promise<string | undefined> {
    try {
        const res = await fetch(datasetUrl);
        if (res.ok) {
            return await res.text();
        } else {
            consoleMessages.value.push({
                content: `Failed to fetch dataset: ${res.status}`,
                icon: ExclamationTriangleIcon,
            });
        }
    } catch (e) {
        consoleMessages.value.push({
            content: `Failed to fetch dataset: ${e}`,
            icon: ExclamationTriangleIcon,
        });
    }
    return undefined;
}

// Inject Prompt
function loadPrompt() {
    const transcripts = [...props.transcripts];
    if (transcripts.length === 0) {
        consoleMessages.value.push({ content: "Injected system prompt.", icon: SparklesIcon });
        transcripts.push({ content: systemPrompt(), role: "system" });
        consoleMessages.value.push({ content: "Injected assistant message.", icon: AcademicCapIcon });
        transcripts.push({ content: MESSAGE_INITIAL, role: "assistant" });
        if (isTestData) {
            transcripts.push({ content: "Plot the mean of bmi by obesity.", role: "user" });
        }
        emit("update", { transcripts });
    }
}

// Load Pyodide
async function loadPyodide() {
    const content = await loadDataset();
    if (content) {
        datasetContent.value = content;
        if (isLoadingPyodide.value) {
            const pyodideMessageIndex = consoleMessages.value.length;
            consoleMessages.value.push({ content: "Loading Pyodide...", icon: ArrowPathIcon, spin: true });
            await pyodide.initialize();
            await pyodide.fsWrite(content, DATASET_NAME);
            consoleMessages.value[pyodideMessageIndex] = { content: "Pyodide ready.", icon: CheckIcon };
            isLoadingPyodide.value = false;
            processUserRequest();
        }
    } else {
        consoleMessages.value.push({ content: "Failed to load dataset.", icon: ExclamationTriangleIcon });
    }
}

// Get system prompt
function systemPrompt() {
    return `${props.specs?.ai_prompt || PROMPT_DEFAULT}`;
}

// Process user request
async function processUserRequest() {
    if (props.transcripts.length > 0 && !isLoadingPyodide.value) {
        const lastTranscript = props.transcripts[props.transcripts.length - 1];
        if (!isProcessingRequest.value && lastTranscript.role == "user") {
            isProcessingRequest.value = true;
            const transcripts = [...props.transcripts];
            try {
                consoleMessages.value.push({ content: "Processing request...", icon: ClockIcon });
                const config = getConfig();
                const reply = await runVintent(pyodide, config, [lastTranscript], DATASET_NAME);
                reply.logs.forEach((log: string) => {
                    consoleMessages.value.push({ content: log, icon: BoltIcon });
                });
                const spec = reply.spec;
                if (spec) {
                    const message = reply.logs.join(" ") || MESSAGE_SUCCESS;
                    widgets.value.push({ spec, message });
                    transcripts.push({ content: message, role: "assistant" });
                    consoleMessages.value.push({ content: MESSAGE_SUCCESS, icon: CheckIcon });
                    emit("update", { settings: { widgets } });
                } else {
                    transcripts.push({ content: MESSAGE_FAILED, role: "assistant" });
                    consoleMessages.value.push({ content: MESSAGE_FAILED, icon: ExclamationTriangleIcon });
                }
            } catch (e) {
                transcripts.push({ content: MESSAGE_FAILED, role: "assistant" });
                consoleMessages.value.push({ content: String(e), icon: ExclamationTriangleIcon });
                console.error(e);
            }
            emit("update", { transcripts });
            isProcessingRequest.value = false;
        }
    }
}

function removeWidget(widgetIndex: number) {
    widgets.value.splice(widgetIndex, 1);
    emit("update", { settings: { widgets } });
}

onMounted(() => {
    const collapse = !!props.settings?.widgets?.length;
    emit("update", { collapse });
    loadPrompt();
    loadPyodide();
});

onUnmounted(() => {
    pyodide.destroy();
});

watch(
    () => props.transcripts,
    () => processUserRequest(),
    { deep: true },
);
</script>

<template>
    <div class="flex flex-col h-screen rounded p-1">
        <div class="flex-1 min-h-0">
            <Dashboard v-if="widgets.length > 0" :widgets="widgets" @remove="removeWidget" />
            <Tabular v-else-if="datasetContent" :content="datasetContent" />
        </div>
        <Console class="shrink-0 pt-1" :messages="consoleMessages" />
    </div>
</template>
