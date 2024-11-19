<script setup>
import { onMounted, ref, watch } from "vue";

import { useColumnsStore } from "galaxy-charts";
import Heatmap from "./heatmap/heatmap";

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

/* Prepare containers */
function createContainers(n) {
    viewport.value.innerHTML = "";
    const containers = [];
    for (var i = 0; i < n; i++) {
        const panel = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        panel.style.float = "left";
        panel.style.height = "100%";
        panel.style.width = 100 / n + "%";
        viewport.value.appendChild(panel);
        containers.push(panel);
    }
    return containers;
}

async function render() {
    const containers = createContainers(props.tracks.length);
    const columnsList = await store.fetchColumns(props.datasetId, props.tracks, ["x", "y", "z"]);
    if (columnsList.length > 0 && Object.keys(columnsList[0]).length === 3) {
        columnsList.forEach((trackData, index) => {
            new Heatmap(containers[index], props.settings, props.tracks[index], trackData);
        });
    }
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
    <div ref="viewport" class="h-screen" />
</template>

<style>
.heatmap-box-item:hover {
    stroke: rgba(0, 0, 0, 0.5);
    stroke-dasharray: 4, 4;
    cursor: pointer;
}
</style>
