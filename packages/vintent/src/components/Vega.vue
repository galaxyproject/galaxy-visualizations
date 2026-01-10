<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
//@ts-ignore
import embed, { type VisualizationSpec } from "vega-embed";
import { nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";

export interface VisSpec {
    spec: VisualizationSpec;
    fillWidth?: boolean;
}

const props = withDefaults(defineProps<VisSpec>(), {
    fillWidth: true,
});

const chartContainer = ref<HTMLDivElement | null>(null);
const errorMessage = ref<string>("");

let vegaView: any;

async function embedChart() {
    try {
        await nextTick();
        if (vegaView) {
            vegaView.finalize();
        }
        if (chartContainer.value !== null) {
            const result = await embed(
                chartContainer.value,
                { ...toRaw(props.spec), width: "container", height: "container" },
                { renderer: "svg" },
            );
            vegaView = result.view;
        }
        errorMessage.value = "";
    } catch (e: any) {
        errorMessage.value = String(e);
    }
}

watch(props, embedChart, { deep: true });

useResizeObserver(chartContainer, () => {
    if (vegaView) {
        window.dispatchEvent(new Event("resize"));
        vegaView.resize().runAsync();
    }
});

onMounted(() => embedChart());

onBeforeUnmount(() => {
    if (vegaView) {
        vegaView.finalize();
    }
});
</script>

<template>
    <div class="flex flex-col h-full min-h-0">
        <div v-if="errorMessage" class="bg-red-100 rounded px-2 py-1 mb-1">
            {{ errorMessage }}
        </div>
        <div ref="chartContainer" class="flex-1 min-h-0 overflow-hidden" />
    </div>
</template>
