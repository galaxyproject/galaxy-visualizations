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
const treeindex = ref(0);
const treelist = ref([]);
const viewport = ref(null);

function extract(content) {
    treelist.value = [];
    let depth = 0,
        start = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === "(") {
            depth++;
        } else if (char === ")") {
            depth--;
        } else if (char === ";" && depth === 0) {
            treelist.value.push(content.slice(start, i + 1).trim());
            start = i + 1;
        }
    }
}

async function load() {
    const response = await fetch(props.datasetUrl);
    if (response.ok) {
        response.text().then((content) => {
            extract(content);
            render();
        });
    } else {
        console.error(response);
    }
}

async function render() {
    if (treeindex.value >= 0 && treeindex.value < treelist.value.length) {
        const source = treelist.value[treeindex.value];
        if (tree) {
            tree.destroy();
            tree = null;
        }
        tree = new phylocanvas(container.value, {
            source,
            alignLabels: props.settings.align_labels,
            fillColour: props.settings.node_color,
            highlightColour: props.settings.highlighted_color,
            interactive: true,
            nodeShape: props.settings.node_shape,
            showLabels: props.settings.show_labels,
            showLeafLabels: props.settings.show_labels,
            strokeColour: props.settings.edge_color,
            type: props.settings.tree_type,
        });
    } else {
        console.error("no");
    }
}

onMounted(() => {
    load();

    // resize tree on window resize
    window.addEventListener("resize", () => {
        if (tree) {
            const bcr = viewport.value.getBoundingClientRect();
            tree.resize(bcr.width, bcr.height);
        }
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
