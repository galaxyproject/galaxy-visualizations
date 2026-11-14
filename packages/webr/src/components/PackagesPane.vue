<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ installed: string[]; repositories: string[]; busy: boolean }>();
const emit = defineEmits<{ (e: "install", packages: string[]): void }>();

const names = ref("");

function install() {
    const packages = names.value.split(/[\s,]+/).filter(Boolean);
    if (packages.length && !props.busy) {
        names.value = "";
        emit("install", packages);
    }
}
</script>

<template>
    <div class="flex h-full flex-col text-xs">
        <div class="flex items-center gap-1 border-b border-gray-200 p-1">
            <input
                v-model="names"
                class="webr-packages-input flex-1 rounded border border-gray-300 px-1"
                placeholder="Package names, e.g. ggplot2 DESeq2"
                @keydown.enter.prevent="install" />
            <button class="webr-button webr-packages-install" :disabled="busy" @click="install">Install</button>
        </div>
        <div class="border-b border-gray-200 p-1 text-gray-500">
            <div v-for="url in repositories" :key="url" class="truncate">{{ url }}</div>
        </div>
        <ul class="flex-1 overflow-auto p-1 font-mono">
            <li v-for="name in installed" :key="name" class="webr-package">{{ name }}</li>
            <li v-if="!installed.length" class="text-gray-500">Only R's base packages are installed.</li>
        </ul>
    </div>
</template>
