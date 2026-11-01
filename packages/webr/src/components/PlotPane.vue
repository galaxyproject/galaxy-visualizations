<script setup lang="ts">
import { computed, ref, watch } from "vue";

export interface Plot {
    url: string;
    bytes: Uint8Array;
}

const props = defineProps<{ plots: Plot[]; canSave: boolean }>();
const emit = defineEmits<{ (e: "save", plot: Plot, index: number): void }>();

const current = ref(0);
const plot = computed(() => props.plots[current.value]);

watch(
    () => props.plots.length,
    (length) => {
        current.value = Math.max(length - 1, 0);
    },
);
</script>

<template>
    <div class="flex h-full flex-col">
        <div v-if="plot" class="flex items-center gap-1 border-b border-gray-200 p-1">
            <button class="webr-button" :disabled="current === 0" title="Previous plot" @click="current--">‹</button>
            <span class="webr-plot-position text-xs text-gray-600">{{ current + 1 }} / {{ plots.length }}</span>
            <button class="webr-button" :disabled="current === plots.length - 1" title="Next plot" @click="current++">
                ›
            </button>
            <a class="webr-button" :href="plot.url" :download="`plot-${current + 1}.png`">Download</a>
            <button v-if="canSave" class="webr-button webr-plot-save" @click="emit('save', plot, current)">
                Save to history
            </button>
        </div>
        <div class="flex flex-1 items-center justify-center overflow-auto p-2">
            <img v-if="plot" class="webr-plot max-h-full max-w-full" :src="plot.url" alt="R plot" />
            <span v-else class="text-xs text-gray-500">Plots appear here.</span>
        </div>
    </div>
</template>
