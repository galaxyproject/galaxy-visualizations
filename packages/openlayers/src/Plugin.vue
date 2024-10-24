<script setup>
import { onMounted, ref, watch } from "vue";
import { MapViewer} from "./openlayers";

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
    viewport.value.innerHTML = "";
    const mv = new MapViewer({});
    mv.loadFile(props.datasetUrl,
        "geojson", //dataset.extension,
        props.settings.geometry_color,
        props.settings.geometry_type,
        props.settings.export_map,
        viewport.value);
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
    <div ref="viewport" class="h-screen p-4"></div>
</template>
