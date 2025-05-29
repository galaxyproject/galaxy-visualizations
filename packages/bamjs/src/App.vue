<script setup>
import { computed } from "vue";
import Plugin from "./Plugin.vue";

const mockProps = {
    root: "http://127.0.0.1:8080",
    tracks: [],
    datasetId: "test-dataset",
    datasetUrl: "mock://test.bam",
    settings: {
        max_records: 50,
        region_start: 0,
        region_end: 10000,
    },
    specs: {},
};

const isGalaxyContext = computed(() => {
    return window.location.pathname.includes("/visualization/");
});

const props = computed(() => {
    if (isGalaxyContext.value) {
        return window.galaxyChartsProps || mockProps;
    }
    return mockProps;
});
</script>

<template>
    <div id="app">
        <Plugin v-bind="props" />
    </div>
</template>
