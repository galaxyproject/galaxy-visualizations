<script setup>
import { onMounted, ref, watch } from "vue";
import { MapViewer } from "./openlayers";
import { ArrowDownTrayIcon } from "@heroicons/vue/24/outline";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);

const mv = new MapViewer({});

function render() {
    viewport.value.innerHTML = "";
    mv.loadFile(
        props.datasetUrl,
        "geojson", //dataset.extension,
        props.settings.geometry_color,
        props.settings.geometry_type,
        viewport.value,
    );
}

function onExport() {
    const canvas = viewport.value?.querySelector("canvas");
    if (canvas) {
        mv.exportMap(canvas);
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
    <div>
        <div ref="viewport" class="h-screen p-4"></div>
        <button
            class="absolute bottom-2 right-2 p-2 bg-sky-100 text-black rounded-full hover:bg-sky-700 hover:bg-opacity-[0.1]"
            @click="onExport">
            <ArrowDownTrayIcon class="w-5 h-5 text-skyblue-600" />
        </button>
    </div>
</template>
