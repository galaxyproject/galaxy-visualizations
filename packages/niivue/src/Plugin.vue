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

const viewport = ref(null);

async function render() {
    const nv = new Niivue();
    await nv.attachTo("gl");
    const volumeList = [{ url: props.datasetUrl }];
    nv.loadVolumes(volumeList);
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
    <canvas ref="viewport" id="gl" />
</template>
