<script setup>
import * as ngl from "ngl";
import { onMounted } from "vue";
import { ref, watch } from "vue";
import { NAlert } from "naive-ui";

const props = defineProps({
    datasetUrl: String,
    settings: Object,
});

const viewport = ref(null);
const errorMessage = ref("");

let stage = null;

function render() {
    // clear container
    viewport.value.innerHTML = "";

    // build stage
    stage = new ngl.Stage(viewport.value, { backgroundColor: props.settings.backcolor });
    const representationParameters = {
        radius: props.settings.radius,
        assembly: props.settings.assembly,
        color: props.settings.colorscheme,
        opacity: props.settings.opacity,
    };
    const stageParameters = { ext: "pdb", defaultRepresentation: true };
    try {
        stage.loadFile(props.datasetUrl, stageParameters).then(function (component) {
            component.addRepresentation(props.settings.mode, representationParameters);
        });
    } catch (e) {
        errorMessage.value = `Failed to render visualization: ${String(e)}`;
    }
    stage.setQuality(props.settings.quality);
    const spin = String(props.settings.spin).toLowerCase() == "true";
    if (spin) {
        stage.setSpin([0, 1, 0], 0.01);
    }
}

onMounted(() => {
    // render molecule
    render();

    // re-renders the molecule view when window is resized
    window.onresize = function () {
        stage.handleResize();
    };
});

watch(
    () => props.settings,
    () => {
        render();
    },
    { deep: true },
);
</script>

<template>
    <n-alert v-if="errorMessage" title="Visualization Plugin Error!" type="error" class="m-2">
        {{ errorMessage }}
    </n-alert>
    <div v-else ref="viewport" />
</template>
