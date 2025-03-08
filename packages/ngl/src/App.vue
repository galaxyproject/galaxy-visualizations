<script setup lang="ts">
import { GalaxyCharts, type PluginIncomingType } from "galaxy-charts";
import Plugin from "./Plugin.vue";

defineProps<{
    container?: string;
    credentials?: RequestCredentials;
    incoming?: PluginIncomingType;
}>();
</script>

<template>
    <GalaxyCharts :container="container" :credentials="credentials" :incoming="incoming">
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
