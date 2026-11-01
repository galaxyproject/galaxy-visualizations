<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { basicSetup, EditorView } from "codemirror";
import { keymap } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { r } from "@codemirror/legacy-modes/mode/r";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void; (e: "run", code: string): void }>();

const element = ref<HTMLDivElement>();
let view: EditorView | null = null;

function selectionOrLine(): string {
    const state = view!.state;
    const range = state.selection.main;
    return range.empty ? state.doc.lineAt(range.head).text : state.sliceDoc(range.from, range.to);
}

function runSelection(): boolean {
    emit("run", selectionOrLine());
    return true;
}

onMounted(() => {
    view = new EditorView({
        doc: props.modelValue,
        parent: element.value!,
        extensions: [
            keymap.of([{ key: "Mod-Enter", run: runSelection }]),
            basicSetup,
            StreamLanguage.define(r),
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    emit("update:modelValue", update.state.doc.toString());
                }
            }),
        ],
    });
});

watch(
    () => props.modelValue,
    (value) => {
        if (view && value !== view.state.doc.toString()) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
        }
    },
);

onBeforeUnmount(() => view?.destroy());

defineExpose({ selectionOrLine });
</script>

<template>
    <div ref="element" class="webr-editor h-full overflow-auto text-sm" />
</template>
