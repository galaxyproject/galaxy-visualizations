<script setup lang="ts">
import { GalaxyCharts, type PluginIncomingType } from "galaxy-charts";
import Plugin from "@/Plugin.vue";

defineProps<{
    collapse?: boolean;
    container?: string;
    credentials?: RequestCredentials;
    incoming?: PluginIncomingType;
}>();
</script>

<template>
    <GalaxyCharts :collapse="collapse" :container="container" :credentials="credentials" :incoming="incoming">
        <template #default="{ datasetId, datasetUrl, root, save, settings, specs, tracks, transcripts, update }">
            <Plugin
                :dataset-id="datasetId"
                :dataset-url="datasetUrl"
                :root="root"
                :settings="settings"
                :specs="specs"
                :tracks="tracks"
                :transcripts="transcripts"
                @save="save"
                @update="update" />
        </template>
    </GalaxyCharts>
</template>
