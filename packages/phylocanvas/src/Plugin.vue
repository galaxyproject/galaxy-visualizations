<script setup>
import { ArrowPathIcon, ArrowLeftIcon, ArrowRightIcon } from "@heroicons/vue/24/outline";
import { NAlert, NButton, NIcon, NTooltip } from "naive-ui";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

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
const errorMessage = ref("");
const isLoading = ref(true);
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
    if (treelist.value.length === 0) {
        errorMessage.value = "No valid trees found.";
    }
}

async function load() {
    isLoading.value = true;
    const response = await fetch(props.datasetUrl);
    if (response.ok) {
        const content = await response.text();
        extract(content);
        render(0);
    } else {
        errorMessage.value = "Failed to load data.";
        console.error(response);
    }
    isLoading.value = false;
}

function render(newIndex) {
    if (newIndex >= 0 && newIndex < treelist.value.length) {
        treeindex.value = newIndex;
        const source = treelist.value[newIndex];
        if (tree) {
            tree.destroy();
            tree = null;
        }
        try {
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
        } catch (e) {
            errorMessage.value = "Failed to render tree.";
            console.error(errorMessage.value, e);
        }
    } else {
        errorMessage.value = `Invalid tree index: ${newIndex}`;
        console.error(errorMessage.value);
    }
}

const handleResize = () => {
    if (tree && viewport.value) {
        const bcr = viewport.value.getBoundingClientRect();
        tree.resize(bcr.width, bcr.height);
    }
};

onMounted(() => {
    load();
    window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
    window.removeEventListener("resize", handleResize);
});

watch(
    () => props.settings,
    () => render(treeindex.value),
    { deep: true },
);
</script>

<template>
    <n-alert v-if="errorMessage" type="error" class="m-1">
        {{ errorMessage }}
    </n-alert>
    <div v-if="isLoading" class="m-2">
        <ArrowPathIcon class="animate-spin size-4 inline mx-1" />
        <span class="text-xs">Please wait...</span>
    </div>
    <div ref="viewport" class="h-screen overflow-hidden">
        <div ref="container" class="h-screen"></div>
        <div v-if="treelist.length > 1" class="absolute bottom-2 left-1/2 transform -translate-x-1/2">
            <div class="flex items-center space-x-2">
                <n-tooltip trigger="hover" :to="false">
                    <template #trigger>
                        <n-button size="small" :disabled="treeindex === 0" @click="render(treeindex - 1)">
                            <template #icon>
                                <n-icon><ArrowLeftIcon /></n-icon>
                            </template>
                        </n-button>
                    </template>
                    <span class="text-xs">Previous</span>
                </n-tooltip>
                <span class="text-sm font-medium"> {{ treeindex + 1 }} of {{ treelist.length }} </span>
                <n-tooltip trigger="hover" :to="false">
                    <template #trigger>
                        <n-button
                            size="small"
                            :disabled="treeindex === treelist.length - 1"
                            @click="render(treeindex + 1)">
                            <template #icon>
                                <n-icon><ArrowRightIcon /></n-icon>
                            </template>
                        </n-button>
                    </template>
                    <span class="text-xs">Next</span>
                </n-tooltip>
            </div>
        </div>
    </div>
</template>
