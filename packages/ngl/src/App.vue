<script setup>
import { GalaxyCharts } from "galaxy-charts";
import Plugin from "@/Plugin.vue";
const config = {
    dataset_url: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/newbox.pdb",
    settings: {},
};
</script>

<template>
    <GalaxyCharts :config="config" xml="config/ngl.xml">
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
