<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConsoleMessageType } from "@/types";
import { ChevronDoubleDownIcon, ChevronDoubleUpIcon } from "@heroicons/vue/24/outline";

const MAX_LENGTH = 1000;

const props = defineProps<{
    messages: ConsoleMessageType[];
}>();

const collapse = ref<boolean>(true);
const hasMessages = computed(() => props.messages.length > 0);
const lastMessage = computed(() => hasMessages && props.messages[props.messages.length - 1]);
const visibleMessages = computed(() => (collapse.value ? [lastMessage.value] : props.messages));

function truncateContent(content: string): string {
    if (collapse.value && content.length > MAX_LENGTH) {
        return content.substring(0, MAX_LENGTH) + "...";
    } else {
        return content;
    }
}
</script>

<template>
    <div v-if="hasMessages" class="flex" :class="collapse ? 'h-auto' : 'h-1/2'">
        <div class="flex-1 overflow-auto">
            <div v-for="msg of visibleMessages">
                <Component :is="msg.icon" class="size-3 inline mr-1" :class="{ 'animate-spin': msg.spin }" />
                <span class="text-xs">{{ truncateContent(msg.content) }}</span>
            </div>
        </div>
        <button class="self-end button-plain" @click="collapse = !collapse">
            <div class="flex justify-center">
                <ChevronDoubleUpIcon v-if="collapse" class="size-4 inline mx-1" />
                <ChevronDoubleDownIcon v-else class="size-4 inline mx-1" />
            </div>
        </button>
    </div>
</template>
