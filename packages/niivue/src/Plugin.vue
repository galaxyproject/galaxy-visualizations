<script setup>
import { onMounted, ref, watch } from "vue";
import { GalaxyApi } from "galaxy-charts";
import { NAlert } from "naive-ui";
import { Niivue } from "@niivue/niivue";

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

async function create() {
    const url = props.datasetUrl;
    try {
        const { data } = await GalaxyApi().GET(`/api/datasets/${props.datasetId}`);
        const extension = data?.extension;
        if (["nii", "nii.gz", "nii.gz", "nii1.gz", "img", "hdr", "mgz", "mgh"].includes(extension)) {
            nv = new Niivue();
            await nv.attachTo("niivue-viewport");
            await nv.loadVolumes([{ url }]);
        } else if (["obj", "stl", "ply", "gii", "vtk"].includes(extension)) {
            nv = new Niivue();
            nv.opts.is3D = true;
            await nv.attachTo("niivue-viewport");
            await nv.loadMeshes([{ url }]);
        } else {
            errorMessage.value = `Unsupported file format: ${extension}.`;
        }
    } catch (e) {
        errorMessage.value = `Failed to request metadata from Galaxy: ${e}`;
    }
}

async function render() {
    if (nv) {
        nv.setColormap(nv.volumes[0].id, props.settings.colormap);
        nv.setInterpolation(props.settings.interpolation);
        nv.setGamma(props.settings.gamma);
        nv.setOpacity(0, props.settings.opacity);
    }
}

onMounted(() => {
    create();
});

watch(
    () => props,
    () => render(),
    { deep: true },
);
</script>

<template>
    <n-alert v-if="errorMessage" type="error" class="m-2">{{ errorMessage }}</n-alert>
    <canvas v-else id="niivue-viewport" ref="viewport" />
</template>
