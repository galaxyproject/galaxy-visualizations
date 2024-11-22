<script setup>
import { computed, onMounted, ref, watch } from "vue";

import { useColumnsStore } from "galaxy-charts";
import Heatmap from "./heatmap/heatmap";
import { ArrowPathIcon, PlayIcon } from "@heroicons/vue/24/solid";
import { NButton, NIcon } from "naive-ui";
import { buildJobDict, submitJob } from "@/heatmap/jobs";
import { waitForDataset } from "@/heatmap/datasets";

const store = useColumnsStore();

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const emit = defineEmits(["save"]);

const viewport = ref(null);

const isCluster = computed(() => props.specs?.variant === "cluster");

const isRunning = ref(false);

const jobDatasetId = computed(() => props.settings?.job_dataset_id);

/* Prepare containers */
function createContainers(n) {
    const containers = [];
    if (viewport.value) {
        viewport.value.innerHTML = "";
        for (var i = 0; i < n; i++) {
            const panel = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            panel.style.float = "left";
            panel.style.height = "100%";
            panel.style.width = 100 / n + "%";
            viewport.value.appendChild(panel);
            containers.push(panel);
        }
    }
    return containers;
}

async function render() {
    // collect source and track data
    let datasetId = null;
    let tracks = [];
    if (jobDatasetId.value) {
        isRunning.value = true;
        await waitForDataset(jobDatasetId.value);
        isRunning.value = false;
        datasetId = jobDatasetId.value;
        let counter = 0;
        props.tracks.forEach((track) => {
            tracks.push({
                x: counter++,
                y: counter++,
                z: counter++,
                key: track.key,
            });
        });
    } else {
        datasetId = props.datasetId;
        tracks = props.tracks;
    }

    // render heatmap
    if (datasetId && tracks.length > 0) {
        const containers = createContainers(tracks.length);
        if (containers.length > 0) {
            const columnsList = await store.fetchColumns(datasetId, tracks, ["x", "y", "z"]);
            if (columnsList.length > 0 && Object.keys(columnsList[0]).length === 3) {
                columnsList.forEach((trackData, index) => {
                    new Heatmap(containers[index], props.settings, tracks[index], trackData);
                });
            }
        }
    }
}

async function onCluster() {
    const toolDict = buildJobDict("heatmap", props.datasetId, props.tracks, ["x", "y", "z"]);
    const jobDatasetId = await submitJob(toolDict);
    emit("save", { job_dataset_id: jobDatasetId });
}

onMounted(() => {
    render();
});

watch(
    () => props,
    () => render(),
    { deep: true },
);

watch(
    () => props.tracks,
    () => emit("save", { job_dataset_id: null }),
    { deep: true },
)
</script>

<template>
    <div class="h-screen">
        <div v-if="isRunning" class="m-2 absolute">
            <n-icon class="mr-1">
                <ArrowPathIcon class="animate-spin" />
            </n-icon>
            <span>Please wait...</span>
        </div>
        <n-button v-else type="primary" size="sm" @click="onCluster" class="p-1 rounded m-2 absolute">
            <n-icon class="mr-1">
                <PlayIcon />
            </n-icon>
            <span>Cluster Data</span>
        </n-button>
        <div ref="viewport" class="h-screen" />
    </div>
</template>

<style>
.heatmap-box-item:hover {
    stroke: rgba(0, 0, 0, 0.5);
    stroke-dasharray: 4, 4;
    cursor: pointer;
}
</style>
