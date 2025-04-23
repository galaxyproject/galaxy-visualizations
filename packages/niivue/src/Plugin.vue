<script setup>
import { onMounted, ref, watch } from "vue";
import { GalaxyApi } from "galaxy-charts";
import { NAlert } from "naive-ui";
import { Niivue } from "@niivue/niivue";
import { debounce } from "lodash-es";

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const errorMessage = ref("");
const viewport = ref();

let nv;

const mapExtension = {
    "nii1.gz": "nii1.gz",
    "nii1": "nii1",
};

async function create() {
    try {
        const { data } = await GalaxyApi().GET(`/api/datasets/${props.datasetId}`);
        const extension = mapExtension[data?.extension];
        const url = `${props.datasetUrl}?__filename=file.${extension}`;
        if (["nii1", "nii1.gz"].includes(extension)) {
            nv = new Niivue();
            await nv.attachTo("niivue-viewport");
            await nv.loadVolumes([{ url }]);
        } else {
            errorMessage.value = `Unsupported file format: ${data?.extension}.`;
        }
        debouncedRender();
    } catch (e) {
        errorMessage.value = `Failed to render: ${e}`;
        throw new Error(e);
    }
}

async function render() {
    if (nv) {
        nv.setColormap(nv.volumes[0].id, props.settings.colormap);
        nv.setInterpolation(props.settings.interpolation);
        nv.setGamma(props.settings.gamma);
        nv.setOpacity(0, props.settings.opacity);
        nv.opts.isColorbar = props.settings.is_colorbar;
        nv.drawScene();
    }
}

const debouncedRender = debounce(render, 300);

onMounted(() => {
    create();
});

watch(
    () => props,
    () => debouncedRender(),
    { deep: true },
);
</script>

<template>
    <n-alert v-if="errorMessage" type="error" class="m-2">{{ errorMessage }}</n-alert>
    <canvas v-else id="niivue-viewport" ref="viewport" />
</template>
