<script setup>
import Plotly from "plotly.js-dist";
import { onMounted, ref, watch } from "vue";

import plotlySurface from "@/variants/surface";
import plotlyBasics from "@/variants/basics";
import plotlyBox from "@/variants/box";
import plotlyHistogram from "@/variants/histogram";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

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
        case "surface":
            wrapper = plotlySurface;
            break;
        default:
            wrapper = plotlyBasics;
    }
    const { data, layout, config } = await wrapper(props.datasetId, props.settings, props.tracks);
    Plotly.newPlot(viewport.value, data, layout, config);
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
