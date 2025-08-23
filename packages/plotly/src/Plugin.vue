<script setup>
import Plotly from "plotly.js-dist";
import { onMounted, ref, watch } from "vue";

import plotlySurface from "@/variants/surface";
import plotlyBasics from "@/variants/basics";
import plotlyBox from "@/variants/box";
import plotlyHeatmap from "@/variants/heatmap";
import plotlyHistogram from "@/variants/histogram";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const message = ref();
const viewport = ref(null);

async function render() {
    let wrapper = null;
    switch (props.specs?.variant) {
        case "box":
            wrapper = plotlyBox;
            break;
        case "histogram":
            wrapper = plotlyHistogram;
            break;
        case "heatmap":
            wrapper = plotlyHeatmap;
            break;
        case "surface":
            wrapper = plotlySurface;
            break;
        default:
            wrapper = plotlyBasics;
    }
    try {
        message.value = "";
        const { data, layout, config } = await wrapper(props.datasetId, props.settings, props.tracks);
        Plotly.newPlot(viewport.value, data, layout, config);
    } catch (e) {
        message.value = `Failed to render: ${e}`;
        console.error(e);
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
    <div v-if="message" class="bg-sky-100 border border-sky-200 p-1 rounded text-sky-800 text-sm">
        {{ message }}
    </div>
    <div ref="viewport" class="h-screen" />
</template>
