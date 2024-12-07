<script setup>
import { onMounted, ref, watch } from "vue";
import JBrowse from "./JBrowse.vue";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);

const jbrowseProps = {
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
    /** Place your render function here! */
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
    <JBrowse class="h-screen" :jbrowseProps="jbrowseProps" ref="viewport" />
</template>
