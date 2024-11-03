<script setup>
import { onMounted, ref, nextTick, watch } from "vue";
import embed from "vega-embed";
import { NAlert } from "naive-ui";
import { GalaxyApi } from "galaxy-charts";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);
const message = ref("");

async function render() {
    try {
        message.value = "";
        await nextTick();
        viewport.value.innerHTML = "";
        let spec = null;
        if (props.settings.source.type === "paste") {
            spec = JSON.parse(props.settings.source.spec);
        } else {
            const { id } = props.settings.source.spec;
            const { data } = await GalaxyApi().GET(`/api/datasets/${id}/display`);
            spec = data;
        }
        if (spec) {
            await embed(viewport.value, spec);
        }
    } catch (e) {
        message.value = `Please provide a valid JSON: ${e}.`;
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
    <n-alert v-if="message" title="Please resolve the following issue:" type="info" class="m-2">{{ message }}</n-alert>
    <div v-else ref="viewport" class="h-screen" />
</template>
