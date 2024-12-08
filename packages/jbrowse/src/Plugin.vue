<script setup>
import { onMounted, ref, watch } from "vue";
import { renderJBrowse } from "./render";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);

function render() {
    const config = JSON.parse(JSON.stringify(props.settings.jbrowseConfig));
    if (viewport.value) {
        renderJBrowse(viewport.value, config);
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
    <div ref="viewport"></div>
</template>
