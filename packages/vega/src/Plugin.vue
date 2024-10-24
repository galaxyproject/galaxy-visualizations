<script setup>
import { onMounted, ref, watch } from "vue";
import embed from "vega-embed";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);

async function render() {
    /** Place your render function here! */

    const spec = {
        $schema: "https://vega.github.io/schema/vega-lite/v4.json",
        width: "container",
        height: "container",
        data: {
            values: [
                { a: "A", b: 28 },
                { a: "B", b: 55 },
                { a: "C", b: 43 },
                { a: "D", b: 91 },
                { a: "E", b: 81 },
                { a: "F", b: 53 },
                { a: "G", b: 19 },
                { a: "H", b: 87 },
                { a: "I", b: 52 },
            ],
        },
        mark: "bar",
        encoding: {
            x: { field: "a", type: "nominal" },
            y: { field: "b", type: "quantitative" },
            tooltip: { field: "b", type: "quantitative" },
        },
    };
    const result = await embed(viewport.value, spec);
    console.log(result.view);
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
    <div ref="viewport" class="h-screen p-4" />
</template>
