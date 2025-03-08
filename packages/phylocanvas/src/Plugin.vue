<script setup>
import { onMounted, ref, watch } from "vue";

import phylocanvas from "@/phylocanvas.min.js";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

let tree = null;

const container = ref(null);
const viewport = ref(null);

async function render() {
    const response = await fetch(props.datasetUrl);
    if (response.ok) {
        response.text().then((content) => {
            if (tree) {
                tree.destroy();
                tree = null;
            }
            tree = new phylocanvas(container.value, {
                alignLabels: props.settings.align_labels,
                fillColour: props.settings.node_color,
                highlightColour: props.settings.highlighted_color,
                interactive: true,
                nodeShape: props.settings.node_shape,
                source: content,
                showLabels: props.settings.show_labels,
                showLeafLabels: props.settings.show_labels,    
                strokeColour: props.settings.edge_color,
                type: props.settings.tree_type,
            });
        });
    } else {
        console.error(response);
    }
}

onMounted(() => {
    render();

    // resize tree on window resize
    window.addEventListener("resize", () => {
        const bcr = viewport.value.getBoundingClientRect();
        tree.resize(bcr.width, bcr.height);
    });
});

watch(
    () => props,
    () => render(),
    { deep: true },
);
</script>

<template>
    <div ref="viewport" class="h-screen overflow-hidden">
        <div ref="container" class="h-screen"></div>
    </div>
</template>
