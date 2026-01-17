<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import mermaid from "mermaid";
import svgPanZoom from "svg-pan-zoom";

const props = defineProps<{
    code: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
let panZoomInstance: ReturnType<typeof svgPanZoom> | null = null;

onMounted(() => {
    mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: "basis",
            padding: 0,
            nodeSpacing: 20,
            rankSpacing: 30,
        },
        themeVariables: {
            fontSize: "11px",
        },
    });
});

async function render() {
    if (!props.code || !containerRef.value) return;

    try {
        if (panZoomInstance) {
            panZoomInstance.destroy();
            panZoomInstance = null;
        }

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, props.code);
        containerRef.value.innerHTML = svg;

        const svgElement = containerRef.value.querySelector("svg");
        if (svgElement) {
            panZoomInstance = svgPanZoom(svgElement, {
                zoomEnabled: true,
                controlIconsEnabled: true,
                fit: true,
                center: true,
                minZoom: 0.1,
                maxZoom: 10,
            });
        }
    } catch (e) {
        console.error("Mermaid render error:", e);
        if (containerRef.value) {
            containerRef.value.innerHTML = `<pre class="text-red-500 text-xs">${e}</pre>`;
        }
    }
}

onUnmounted(() => {
    if (panZoomInstance) {
        panZoomInstance.destroy();
        panZoomInstance = null;
    }
});

watch([() => props.code, containerRef], render);
</script>

<template>
    <div>
        <div ref="containerRef" class="mermaid-container relative border border-gray-200 rounded-lg bg-white h-96" />
        <p class="text-xs text-gray-400 mt-1">Scroll to zoom, drag to pan</p>
    </div>
</template>

<style scoped>
.mermaid-container :deep(svg) {
    width: 100%;
    height: 100%;
}

.mermaid-container :deep(#svg-pan-zoom-controls) {
    transform: translate(10px, 10px);
    scale: 0.7;
}
</style>
