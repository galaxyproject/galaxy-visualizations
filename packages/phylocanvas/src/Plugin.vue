<script setup>
import { onMounted, ref, watch } from "vue";

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
    /** Place your render function here! */
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
    <div class="flex items-center justify-center min-h-screen bg-gray-900 text-white" ref="viewport">
        <div class="text-center p-6 max-w-lg bg-gray-800 rounded-lg shadow-lg">
            <h1 class="text-2xl font-bold mb-4">Welcome to the Galaxy Charts Starter!</h1>
            <p class="text-lg mb-6">Initialization Complete!</p>
            <p class="mb-6">
                Begin creating your visualization in <code class="bg-gray-700 p-1 rounded">src/Plugin.vue</code>.
            </p>
            <p class="mb-6">
                Configure your XML in <code class="bg-gray-700 p-1 rounded">public/MY_VISUALIZATION.xml</code>.
            </p>
            <p class="mb-6">
                Provide local runtime settings in <code class="bg-gray-700 p-1 rounded">src/main.js</code>.
            </p>
            <a
                href="https://galaxyproject.github.io/galaxy-charts/"
                target="_blank"
                class="text-blue-400 hover:text-blue-300 underline">
                Galaxy Charts Documentation
            </a>
        </div>
    </div>
</template>
