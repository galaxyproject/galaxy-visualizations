<script setup>
import { onMounted, ref, watch } from "vue";
import { createViewer } from "vizarr/dist/index";
import axios from "axios";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);
const errorMessage = ref();

async function render() {
    const dataset = await getDataset();
    if (!dataset) {
        errorMessage.value = `Dataset ${props.datasetId} not found or failed to load`;
        return;
    }

    const url = getSourceUrl(dataset);
    if (!url) {
        errorMessage.value = `Cannot find source URL for dataset ${props.datasetId}`;
        return;
    }

    const targetElement = viewport.value;
    const viewer = await createViewer(targetElement);
    const config = {
        source: url,
        name: dataset.name,
    };
    viewer.addImage(config);
}

async function getDataset() {
    try {
        const { data: dataset } = await axios.get(`/api/datasets/${props.datasetId}`);
        return dataset;
    } catch (error) {
        error.value = `Failed to load dataset: ${error.message}`;
    }
}

function getSourceUrl(dataset) {
    if (dataset.state === "deferred") {
        return dataset.sources[0].source_uri;
    }
    return (
        window.location.origin +
        prefixedDownloadUrl(props.root, `datasets/${dataset.id}/display/${dataset.metadata_store_root}`)
    );
}

const slashCleanup = /(\/)+/g;
function prefixedDownloadUrl(root, path) {
    return `${root}/${path}`.replace(slashCleanup, "/");
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
    <div role="alert" v-if="errorMessage">
        <div class="bg-red-500 text-white font-bold rounded-t px-4 py-2">An error ocurred</div>
        <div class="border border-t-0 border-red-400 rounded-b bg-red-100 px-4 py-3 text-red-700">
            <p>{{ errorMessage }}</p>
        </div>
    </div>
    <div ref="viewport" class="h-screen p-4" />
</template>
