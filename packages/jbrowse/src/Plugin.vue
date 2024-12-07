<script setup>
import { onMounted, ref, watch } from "vue";
import { renderJBrowse } from "./render";
import config from "./config";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);

const config1 = {
    assembly: {
        name: "hg19",
        sequence: {
            type: "ReferenceSequenceTrack",
            trackId: "refseq_track",
            adapter: {
                type: "TwoBitAdapter",
                twoBitLocation: {
                    uri: "https://jbrowse.org/genomes/hg19/hg19.2bit",
                },
            },
        },
    },
};

async function render() {
    if (viewport.value) {
        renderJBrowse(viewport.value, config);
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
    <div ref="viewport"></div>
</template>
