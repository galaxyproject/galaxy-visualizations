<script setup>
import { computed, onMounted, ref, watch } from "vue";

import { useColumnsStore } from "galaxy-charts";
import Heatmap from "./heatmap/heatmap";
import { PlayIcon } from "@heroicons/vue/24/solid";
import { NButton, NIcon } from "naive-ui";
import { buildJobDict, submitJob } from "@/heatmap/jobs";

const store = useColumnsStore();

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);

const hasJobId = computed(() => props.settings?.job_id);

const isCluster = computed(() => props.specs?.variant === "cluster");

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
    // submit the job
    // update settings
    //emit("update-settings", { job_id: "xyz" });

    // wait for results and change
    const containers = createContainers(props.tracks.length);
    if (containers.length > 0) {
        const columnsList = await store.fetchColumns(props.datasetId, props.tracks, ["x", "y", "z"]);
        if (columnsList.length > 0 && Object.keys(columnsList[0]).length === 3) {
            columnsList.forEach((trackData, index) => {
                new Heatmap(containers[index], props.settings, props.tracks[index], trackData);
            });
        }
    }
}

async function onCluster() {
    const toolDict = buildJobDict("heatmap", props.datasetId, props.tracks);
    const response = await submitJob(toolDict);
    console.log(response);
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
    <div>
        <div v-if="isCluster && !hasJobId" class="p-6">
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
        <div v-else ref="viewport" class="h-screen" />
    </div>
</template>

<style>
.heatmap-box-item:hover {
    stroke: rgba(0, 0, 0, 0.5);
    stroke-dasharray: 4, 4;
    cursor: pointer;
}
</style>
