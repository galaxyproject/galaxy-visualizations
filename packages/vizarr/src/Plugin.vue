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

async function render() {
    const targetElement = viewport.value;
    const viewer = await createViewer(targetElement);
    const { data: dataset } = await axios.get(`/api/datasets/${props.datasetId}`);

    const url = getSourceUrl(dataset);

    const config = {
        source: url,
        name: dataset.name,
    };
    viewer.addImage(config);
}

function getSourceUrl(dataset) {
    return dataset.metadata_remote_uri
        ? dataset.metadata_remote_uri
        : window.location.origin +
              prefixedDownloadUrl(props.root, `datasets/${dataset.id}/display/${dataset.metadata_store_root}`);
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
    <div ref="viewport" class="h-screen p-4" />
</template>
