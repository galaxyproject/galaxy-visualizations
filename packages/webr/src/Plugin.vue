<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { EmitSaveType, SaveResultType } from "galaxy-charts";
import ScriptEditor from "@/components/ScriptEditor.vue";
import RConsole, { type ConsoleEntry } from "@/components/RConsole.vue";
import PlotPane, { type Plot } from "@/components/PlotPane.vue";
import FilesPane from "@/components/FilesPane.vue";
import PackagesPane from "@/components/PackagesPane.vue";
import { HOME, INPUT_DIR, parseRepositories, rString, RSession } from "@/session.js";
import { fetchDataset, getDataset, uploadToHistory } from "@/galaxy.js";
import { defaultScript, galaxyExtension, inputName } from "@/defaults.js";

interface Dataset {
    id: string;
    hid?: number;
    name?: string;
    extension?: string;
    history_id?: string;
}

const props = defineProps<{
    credentials?: RequestCredentials;
    datasetId: string;
    datasetUrl: string;
    root: string;
    save: (payload: EmitSaveType) => Promise<SaveResultType>;
    settings: Record<string, any>;
}>();

const emit = defineEmits<{
    (e: "update", payload: { settings: Record<string, any> }): void;
}>();

const TABS = ["plots", "files", "packages"] as const;

const busy = ref(true);
const status = ref("Starting R…");
const entries = ref<ConsoleEntry[]>([]);
const plots = ref<Plot[]>([]);
const files = ref<string[]>([]);
const installed = ref<string[]>([]);
const tab = ref<(typeof TABS)[number]>("plots");
const script = ref(String(props.settings.script || ""));
const dataset = ref<Dataset | null>(null);
const inputPath = ref("");
const editor = ref<InstanceType<typeof ScriptEditor>>();
const plotArea = ref<HTMLDivElement>();

const repositories = computed(() => parseRepositories(props.settings.repositories));
const canSave = computed(() => !!dataset.value?.history_id);

let session: RSession | null = null;

function log(type: string, text: string) {
    entries.value.push({ type, text });
}

async function toPlot(bitmap: ImageBitmap): Promise<Plot> {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { url: URL.createObjectURL(blob), bytes: new Uint8Array(await blob.arrayBuffer()) };
}

async function refresh() {
    files.value = [...(await session!.listFiles(HOME)), ...(await session!.listFiles("/galaxy"))];
    installed.value = await session!.installed();
}

async function loadDataset() {
    try {
        const details: Dataset = await getDataset(props.root, props.datasetId, props.credentials);
        const bytes = await fetchDataset(props.datasetUrl, props.credentials);
        const path = `${INPUT_DIR}/${inputName(details)}`;
        await session!.writeFile(path, bytes);
        await session!.webR.evalRVoid(`galaxy_input <- ${rString(path)}`);
        dataset.value = details;
        inputPath.value = path;
        log("info", `Dataset ${details.hid ?? ""} "${details.name}" is at ${path} (galaxy_input).`);
    } catch (error) {
        log("error", String(error));
    }
}

async function start() {
    busy.value = true;
    status.value = "Starting R…";
    session = new RSession(repositories.value);
    const version = await session.start();
    log("info", `${version} (webR, in this browser tab)`);
    if (props.datasetId) {
        await loadDataset();
    }
    if (!script.value) {
        script.value = inputPath.value ? defaultScript(dataset.value?.extension || "", inputPath.value) : "";
    }
    await refresh();
    status.value = "Ready";
    busy.value = false;
}

async function execute(code: string, task: () => Promise<{ entries: ConsoleEntry[]; images: ImageBitmap[] }>) {
    busy.value = true;
    status.value = "Running…";
    log("input", code.trim());
    try {
        const result = await task();
        result.entries.forEach((item) => log(item.type, item.text.replace(/\n$/, "")));
        const added = await Promise.all(result.images.map(toPlot));
        plots.value = [...plots.value, ...added];
        if (added.length) {
            tab.value = "plots";
        }
        await refresh();
    } catch (error) {
        log("error", String(error));
    }
    status.value = "Ready";
    busy.value = false;
}

function plotSize() {
    const width = Math.max(plotArea.value?.clientWidth ?? 640, 320);
    const height = Math.max((plotArea.value?.clientHeight ?? 520) - 40, 240);
    return { width, height };
}

function run(code: string) {
    if (code.trim() && !busy.value) {
        execute(code, () => session!.run(code, plotSize()));
    }
}

function runScript() {
    run(script.value);
}

function runSelection() {
    run(editor.value?.selectionOrLine() || "");
}

function install(packages: string[]) {
    execute(`webr::install(${packages.map((name) => rString(name)).join(", ")})`, () => session!.install(packages));
}

async function restart() {
    session?.close();
    log("info", "Restarting R. Objects in the workspace are gone; files in the home directory are gone too.");
    await start();
}

function updateScript(value: string) {
    script.value = value;
    emit("update", { settings: { script: value } });
}

async function saveScript() {
    const result = await props.save({ settings: { script: script.value } });
    if (result.status === "error") {
        log("error", `The script was not saved: ${result.message}`);
    } else {
        log("info", "Saved the script with this visualization.");
    }
}

async function saveToHistory(name: string, bytes: Uint8Array) {
    try {
        await uploadToHistory(
            props.root,
            dataset.value!.history_id!,
            name,
            galaxyExtension(name),
            bytes,
            props.credentials,
        );
        log("info", `Sent ${name} to the history.`);
    } catch (error) {
        log("error", String(error));
    }
}

function savePlot(plot: Plot, index: number) {
    saveToHistory(`plot-${index + 1}.png`, plot.bytes);
}

async function saveFile(path: string) {
    saveToHistory(path.split("/").pop()!, await session!.readFile(path));
}

async function downloadFile(path: string) {
    const bytes = await session!.readFile(path);
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([bytes]));
    anchor.download = path.split("/").pop()!;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
}

onMounted(() => {
    start().catch((error) => {
        status.value = "R did not start";
        log("error", String(error));
    });
});

onBeforeUnmount(() => session?.close());
</script>

<template>
    <div class="flex h-screen bg-white text-gray-900">
        <div class="flex w-1/2 min-w-0 flex-col border-r border-gray-200">
            <div class="flex items-center gap-1 border-b border-gray-200 p-1">
                <button class="webr-button webr-run-script" :disabled="busy" @click="runScript">Run script</button>
                <button class="webr-button webr-run-line" :disabled="busy" title="Ctrl/Cmd+Enter" @click="runSelection">
                    Run line or selection
                </button>
                <button class="webr-button webr-save-script" @click="saveScript">Save script</button>
                <button class="webr-button webr-restart" title="The only way to stop running code" @click="restart">
                    Restart R
                </button>
                <span class="webr-status ml-auto text-xs text-gray-500">{{ status }}</span>
            </div>
            <div class="h-1/2 min-h-0">
                <ScriptEditor ref="editor" :model-value="script" @update:model-value="updateScript" @run="run" />
            </div>
            <div class="h-1/2 min-h-0 border-t border-gray-200">
                <RConsole :entries="entries" :busy="busy" @run="run" />
            </div>
        </div>
        <div ref="plotArea" class="flex w-1/2 min-w-0 flex-col">
            <div class="flex border-b border-gray-200">
                <button
                    v-for="name in TABS"
                    :key="name"
                    :class="['webr-tab', `webr-tab-${name}`, { 'webr-tab-active': tab === name }]"
                    @click="tab = name">
                    {{ name[0].toUpperCase() + name.slice(1) }}
                </button>
            </div>
            <div class="min-h-0 flex-1">
                <PlotPane v-show="tab === 'plots'" :plots="plots" :can-save="canSave" @save="savePlot" />
                <FilesPane
                    v-show="tab === 'files'"
                    :files="files"
                    :can-save="canSave"
                    @refresh="refresh"
                    @save="saveFile"
                    @download="downloadFile" />
                <PackagesPane
                    v-show="tab === 'packages'"
                    :installed="installed"
                    :repositories="repositories"
                    :busy="busy"
                    @install="install" />
            </div>
        </div>
    </div>
</template>
