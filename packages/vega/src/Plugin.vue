<script setup>
import { onMounted, ref, nextTick, watch } from "vue";
import embed from "vega-embed";
import { NAlert } from "naive-ui";
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
    if (props.settings.spec) {
        try {
            message.value = "";
            await nextTick();
            viewport.value.innerHTML = "";
            const spec = JSON.parse(props.settings.spec);
            await embed(viewport.value, spec);
        } catch (e) {
            message.value = `Please provide a valid JSON: ${e}.`;
        }
    } else {
        message.value = "Please provide a JSON object using the text input area.";
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
    <div v-else ref="viewport" class="h-screen p-4" />
</template>
