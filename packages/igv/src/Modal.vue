<template>
    <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
        <div class="bg-white rounded shadow max-w-md w-full mx-4">
            <div class="p-4">
                <h2 v-if="title" class="font-semibold text-gray-800 mb-3">{{ title }}</h2>
                <p class="text-sm text-gray-600 whitespace-pre-line">{{ message }}</p>
                <div class="mt-5 flex justify-end">
                    <button
                        class="px-4 py-1 text-sm font-medium bg-sky-200 text-black rounded hover:bg-sky-600"
                        @click="$emit('close')">
                        OK
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    show: boolean;
    title?: string;
    message: string;
}>();
defineEmits<{
    (event: "close"): void;
}>();
</script>
