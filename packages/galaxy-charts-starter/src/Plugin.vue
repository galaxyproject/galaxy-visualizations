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

function render() {
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
    <div ref="viewport" class="h-screen p-4">
        <div class="text-lg py-4">Welcome to Galaxy Charts</div>
        <div>Use the form on the right to specify settings, these are then parsed to your plugin component!</div>
        <div>
            e.g. `Setting:Text` is: <span class="font-bold">{{ props.settings.setting_text }}</span
            >, and `Setting:Boolean` is: <span class="font-bold">{{ props.settings.setting_boolean }}</span
            >.
        </div>
        <div class="py-4">
            <span>You have also provided details for the following tracks:</span>
            <div v-for="(track, index) of props.tracks">
                <span class="mx-2">Track No. {{ index + 1 }}:</span>
                <span class="font-bold">'{{ track.track_text }}' and </span>
                <span class="font-bold">{{ track.track_color || "no color selected" }}.</span>
            </div>
        </div>
    </div>
</template>
