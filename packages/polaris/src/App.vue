<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { IncomingDataType, VisualizationSpecsType } from "@/types";
import Plugin from "@/Plugin.vue";

const props = defineProps<{
    container?: string;
    credentials?: RequestCredentials;
}>();

// Parsed data from incoming
const datasetId = ref<string>("");
const root = ref<string>("/");
const specs = ref<VisualizationSpecsType>({});

// Parse incoming data from container element
function parseIncoming(): IncomingDataType | null {
    const containerEl = document.getElementById(props.container || "app");
    if (!containerEl?.dataset.incoming) {
        return null;
    }
    try {
        return JSON.parse(containerEl.dataset.incoming) as IncomingDataType;
    } catch (e) {
        console.error("Failed to parse incoming data:", e);
        return null;
    }
}

onMounted(() => {
    const incoming = parseIncoming();
    if (incoming) {
        root.value = incoming.root || "/";
        datasetId.value = incoming.visualization_config?.dataset_id || "";
        specs.value = incoming.visualization_plugin?.specs || {};
    }
});
</script>

<template>
    <Plugin :dataset-id="datasetId" :root="root" :specs="specs" />
</template>
