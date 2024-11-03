<script setup>
import { GalaxyCharts } from "galaxy-charts";
import Plugin from "@/Plugin.vue";

const props = defineProps({
    config: {
        type: Object,
        default: () => {},
    },
    xml: {
        type: String,
        required: true,
    },
});
</script>

<template>
    <GalaxyCharts :config="config" :xml="xml">
        <template #default="{ datasetId, datasetUrl, root, settings, specs, tracks }">
            <Plugin
                :dataset-id="datasetId"
                :dataset-url="datasetUrl"
                :root="root"
                :settings="settings"
                :specs="specs"
                :tracks="tracks" />
        </template>
    </GalaxyCharts>
</template>
