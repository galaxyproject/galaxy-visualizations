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
        <template #default="{ datasetId, datasetUrl, root, save, settings, update }">
            <Plugin
                :credentials="credentials"
                :dataset-id="datasetId"
                :dataset-url="datasetUrl"
                :root="root"
                :save="save"
                :settings="settings"
                @update="update" />
        </template>
    </GalaxyCharts>
</template>
