<script setup lang="ts">
import { GalaxyCharts, type PluginIncomingType } from "galaxy-charts";
import Viewport from "./Viewport.vue";

defineProps<{
    credentials?: RequestCredentials;
    incoming?: PluginIncomingType;
}>();
</script>

<template>
    <GalaxyCharts :credentials="credentials" :incoming="incoming">
        <template #default="{ datasetId, datasetUrl, root, settings, specs, tracks }">
            <Viewport
                :dataset-id="datasetId"
                :dataset-url="datasetUrl"
                :root="root"
                :settings="settings"
                :specs="specs"
                :tracks="tracks" />
        </template>
    </GalaxyCharts>
</template>
