<script setup lang="ts">
import axios from "axios";
import Cytoscape, { type Core, type ElementDefinition, type ElementsDefinition } from "cytoscape";
import { onMounted, onUnmounted, ref, watch } from "vue";

import { parseSIF, runSearchAlgorithm, runTraversalType, styleGenerator } from "./utils";

type Settings = {
    directed: boolean;
    layout_name: "breadthfirst" | "circle" | "concentric" | "cose" | "grid" | "null" | "preset" | "random";
    curve_style: "haystack" | "straight" | "bezier" | "unbundled-bezier" | "segments" | "taxi";
    color_picker_nodes: string;
    color_picker_edges: string;
    color_picker_highlighted: string;
    graph_traversal?: "successors" | "predecessors" | "outgoers" | "incomers" | "roots" | "leaves";
    search_algorithm?: "bfs" | "dfs" | "kruskal" | "astar";
};

interface Props {
    root: string;
    tracks: unknown[];
    datasetId: string;
    datasetUrl: string;
    settings: Settings;
    specs?: object;
}

const props = defineProps<Props>();

const viewport = ref(null);

const cytoscape = ref<Core | null>(null);
const dataset = ref<ElementsDefinition | ElementDefinition[]>();

async function render() {
    cytoscape.value = Cytoscape({
        container: viewport.value,
        elements: dataset.value,
        layout: {
            name: props.settings.layout_name,
            idealEdgeLength: () => 100,
            nodeOverlap: 20,
        },
        minZoom: 0.1,
        maxZoom: 50,
        style: styleGenerator(props.settings),
    });

    if (props.settings.search_algorithm === "kruskal") {
        cytoscape.value.elements().kruskal().edges().addClass("searchpath");
    }

    cytoscape.value.on("tap", "node", (e) => {
        const ele = e.target;

        const search_algorithm = props.settings.search_algorithm;
        const traversal_type = props.settings.graph_traversal;

        if (cytoscape.value && search_algorithm) {
            runSearchAlgorithm(cytoscape.value, ele.id(), search_algorithm);
        } else if (cytoscape.value && traversal_type) {
            runTraversalType(cytoscape.value, ele.id(), traversal_type);
        }
    });
}

async function getDataset() {
    const { data } = await axios.get(props.datasetUrl);

    if (data.file_ext === "sif") {
        dataset.value = parseSIF(data).content;
    } else {
        dataset.value = data.elements ? data.elements : data;
    }
}

watch(
    () => props,
    () => render(),
    { deep: true },
);

onMounted(async () => {
    await getDataset();

    await render();

    window.addEventListener("resize", function () {
        cytoscape.value?.resize();
    });
});

onUnmounted(() => {
    window.removeEventListener("resize", function () {
        console.log("Removing resize event listener");
    });

    cytoscape.value?.destroy();
});
</script>

<template>
    <div class="min-h-screen" ref="viewport"></div>
</template>
