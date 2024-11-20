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
    if (isCluster.value) {
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
        }
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
</script>

<template>
    <div class="h-screen">
        <div v-if="isRunning" class="m-2 absolute">
            <n-icon class="mr-1">
                <ArrowPathIcon class="animate-spin" />
            </n-icon>
            <span>Please wait...</span>
        </div>
        <div v-else-if="isCluster && !jobDatasetId" class="p-6">
            <div class="p-4 bg-sky-50 rounded-lg text-center">
                <p class="mb-4 text-large">
                    Add and configure the data tracks to be clustered using the panel on the right, then click to
                    initiate the clustering process and generate a clustered heatmap visualization.
                </p>
                <n-button type="primary" @click="onCluster">
                    <span class="mr-2">
                        <n-icon>
                            <PlayIcon />
                        </n-icon>
                    </span>
                    Generate Clustered Heatmap
                </n-button>
            </div>
        </div>
        <n-button v-if="isCluster && jobDatasetId && !isRunning" type="primary" @click="onCluster" class="m-2 absolute">
            <n-icon>
                <ArrowPathIcon />
            </n-icon>
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
