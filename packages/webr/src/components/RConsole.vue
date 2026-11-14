<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

export interface ConsoleEntry {
    type: string;
    text: string;
}

const props = defineProps<{ entries: ConsoleEntry[]; busy: boolean }>();
const emit = defineEmits<{ (e: "run", code: string): void }>();

const command = ref("");
const history = ref<string[]>([]);
const position = ref(0);
const log = ref<HTMLDivElement>();

const COLOURS: Record<string, string> = {
    input: "text-sky-700",
    stderr: "text-red-700",
    error: "text-red-700 font-semibold",
    warning: "text-amber-700",
    message: "text-gray-500",
    info: "text-gray-500 italic",
};

function submit() {
    const code = command.value;
    if (code.trim() && !props.busy) {
        history.value.push(code);
        position.value = history.value.length;
        command.value = "";
        emit("run", code);
    }
}

function browse(step: number) {
    const next = Math.min(Math.max(position.value + step, 0), history.value.length);
    position.value = next;
    command.value = history.value[next] ?? "";
}

watch(
    () => props.entries.length,
    async () => {
        await nextTick();
        log.value?.scrollTo({ top: log.value.scrollHeight });
    },
);
</script>

<template>
    <div class="flex h-full flex-col font-mono text-xs">
        <div ref="log" class="webr-console-log flex-1 overflow-auto whitespace-pre-wrap p-2">
            <div v-for="(entry, index) in entries" :key="index" :class="COLOURS[entry.type] || 'text-gray-900'">
                {{ entry.type === "input" ? `> ${entry.text}` : entry.text }}
            </div>
        </div>
        <div class="flex items-center border-t border-gray-200 px-2 py-1">
            <span class="mr-1 text-sky-700">{{ busy ? "…" : ">" }}</span>
            <input
                v-model="command"
                class="webr-console-input flex-1 outline-none"
                placeholder="Type R code and press Enter"
                spellcheck="false"
                @keydown.enter.prevent="submit"
                @keydown.up.prevent="browse(-1)"
                @keydown.down.prevent="browse(1)" />
        </div>
    </div>
</template>
