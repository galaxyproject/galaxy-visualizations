<script setup>
import { onMounted, ref, watch } from "vue";
import { Niivue } from "@niivue/niivue";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

let nv;

async function create() {
    nv = new Niivue();
    await nv.attachTo("niivue-viewport");
    const volumeList = [{ url: props.datasetUrl }];
    nv.loadVolumes(volumeList);
}

async function render() {
    if (nv) {
        nv.setColormap(nv.volumes[0].id, props.settings.colormap);
        nv.setInterpolation(props.settings.interpolation);
        nv.setGamma(props.settings.gamma);
        nv.setOpacity(0, props.settings.opacity);
    }
}

onMounted(() => {
    create();
});

watch(
    () => props,
    () => render(),
    { deep: true },
);
</script>

<template>
    <canvas id="niivue-viewport" />
</template>
