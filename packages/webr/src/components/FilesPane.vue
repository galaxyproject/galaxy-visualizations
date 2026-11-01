<script setup lang="ts">
const props = defineProps<{ files: string[]; canSave: boolean }>();
const emit = defineEmits<{
    (e: "refresh"): void;
    (e: "save", path: string): void;
    (e: "download", path: string): void;
}>();
</script>

<template>
    <div class="flex h-full flex-col text-xs">
        <div class="flex items-center gap-1 border-b border-gray-200 p-1">
            <button class="webr-button webr-files-refresh" @click="emit('refresh')">Refresh</button>
        </div>
        <ul class="flex-1 overflow-auto p-1">
            <li v-for="path in props.files" :key="path" class="webr-file flex items-center gap-1 py-0.5">
                <span class="flex-1 truncate font-mono" :title="path">{{ path }}</span>
                <button class="webr-button" @click="emit('download', path)">Download</button>
                <button v-if="canSave" class="webr-button webr-file-save" @click="emit('save', path)">
                    Save to history
                </button>
            </li>
            <li v-if="!props.files.length" class="text-gray-500">No files yet.</li>
        </ul>
    </div>
</template>
