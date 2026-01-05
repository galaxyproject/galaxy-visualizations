<script setup lang="ts">
import { computed } from "vue";
import Vega from "@/components/Vega.vue";
import { XMarkIcon } from "@heroicons/vue/24/outline";

const props = defineProps<{
    widgets: Array<any>;
}>();

const emit = defineEmits<{
    (event: "remove", widgetIndex: number): void;
}>();

const count = computed(() => props.widgets.length);

const columns = computed(() => {
    if (count.value === 0) {
        return 1;
    } else {
        return Math.ceil(Math.sqrt(count.value));
    }
});

const grid = computed(() => {
    return {
        display: "grid",
        gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
        gap: "0.5rem",
    };
});

function remove(widgetIndex: number) {
    emit("remove", widgetIndex);
}
</script>
<template>
    <div class="h-full" :style="grid">
        <div
            v-for="(widget, widgetIndex) in props.widgets"
            :key="widgetIndex"
            class="flex flex-col min-h-0 bg-white border border-gray-200 rounded text-gray-800 text-sm">
            <Vega class="flex-1 min-h-0 overflow-hidden p-1" :spec="widget" />
            <button class="vintent-button absolute z-[9998]" @click="remove(widgetIndex)">
                <div class="flex justify-center">
                    <XMarkIcon class="size-5 inline" />
                </div>
            </button>
        </div>
    </div>
</template>
