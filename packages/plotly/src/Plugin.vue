<script setup>
import Plotly from "plotly.js-dist";
import { onMounted, ref, watch } from "vue";
import { useColumnsStore } from "galaxy-charts";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);
const columnsStore = useColumnsStore();

async function plotlyDefault() {
    const layout = {
        xaxis: {
            title: {
                text: props.settings.x_axis_label,
            },
        },
        yaxis: {
            title: {
                text: props.settings.y_axis_label,
            },
        },
    };
    const config = { responsive: true };
    const columnsList = await columnsStore.fetchColumns(props.datasetId, props.tracks, ["x", "y"]);
    const plotData = [];
    columnsList.forEach((columns, index) => {
        const track = props.tracks[index];
        const mode = ["bar", "lines"].includes(track.type) ? "lines" : "markers";
        plotData.push({
            marker: {
                color: track.color,
            },
            mode: mode,
            name: track.name,
            type: track.type,
            x: columns.x,
            y: columns.y,
        });
    });
    Plotly.newPlot(viewport.value, plotData, layout, config);
}

function render() {
    plotlyDefault();
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
