<script setup>
import { GalaxyCharts } from "galaxy-charts";
import Plugin from "@/Plugin.vue";
const config = {
    dataset_id: null,
    dataset_url: "pa-voting-precincts.txt",
    settings: {},
    // settings: {
    //     setting_text: "my test text",
    //     setting_boolean: true,
    // },
};
</script>

<template>
    <GalaxyCharts :config="config" xml="openlayers.xml">
        <template #default="{ datasetId, datasetUrl, root, settings, specs, tracks }">
            <!-- test -->
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
