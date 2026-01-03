<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";

import igv from "igv";
import { LastQueue } from "./lastQueue";
import { GalaxyApi, useDataTableStore, useDataJsonStore } from "galaxy-charts";
import CONFIG from "./config.yml";

import Modal from "./Modal.vue";

const DEFAULT_GENOME = "hg38";
const DEFAULT_TYPE = "annotation";
const UNKNOWN_GENOME = "?";
const DELAY = 500;
const IGV_GENOMES = "https://s3.amazonaws.com/igv.org.genomes/genomes.json";
const TEST_DATASET_URL = "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/gencode.v29.annotation.gff3";
const TEST_DATASET_DETAILS = { extension: "gff3", id: "__test__", metadata_dbkey: "hg18", name: "TEST DATASET" };

type Atomic = string | number | boolean | null | undefined;

interface Dataset {
    extension?: string;
    id: string;
    metadata_dbkey?: string;
    name?: string;
}

interface Track {
    name: string;
    order?: number;
    [key: string]: TrackValue;
}

type TrackValue = Atomic | Dataset | Track;

const lastQueue = new LastQueue<any>(DELAY);

const props = defineProps<{
    datasetId: string;
    root: string;
    settings: {
        locus: string;
        source: {
            genome: any;
            origin: string;
        };
    };
    specs: Record<string, unknown>;
    tracks: Track[];
}>();

// Emit events with TypeScript
const emit = defineEmits<{
    (event: "update", config: any): void;
}>();

const dragging = ref(false);
const loading = ref(false);
const message = ref("");
const showModal = ref(false);
const viewport = ref<HTMLDivElement | null>(null);

let igvBrowser: any = null;
let igvTracks: Array<Track> = [];

onMounted(() => {
    create();
});

onBeforeUnmount(() => {
    dispose();
});

watch(
    () => props.settings.source?.genome,
    () => lastQueue.enqueue(loadGenome, undefined, "loadGenome"),
);

watch(
    () => props.settings.locus,
    () => lastQueue.enqueue(locusSearch, undefined, "locusSearch"),
);

watch(
    () => props.tracks,
    () => lastQueue.enqueue(loadTracks, undefined, "loadTracks"),
);

async function create() {
    if (props.settings.source.genome) {
        await loadGenome();
    } else if (props.datasetId) {
        // match database key to genomes
        const dataset = await getDatasetDetails(props.datasetId);
        if (dataset) {
            const dbkey = dataset.metadata_dbkey || UNKNOWN_GENOME;
            showModal.value = !dbkey || dbkey === UNKNOWN_GENOME;

            // identify source
            const source = (await findGenome(dbkey)) || (await findGenome(DEFAULT_GENOME));

            // emit update
            const newSettings = source ? { source } : {};
            const newTracks = [{ urlDataset: { id: dataset.id } }];
            emit("update", { settings: newSettings, tracks: newTracks });
            console.debug("[igv] Updating values.", newSettings, newTracks);
        }
    } else {
        message.value = "Genome selection required. Open the side panel and choose options.";
    }
}

function dispose() {
    if (igvBrowser) {
        igv.removeBrowser(igvBrowser);
        igvBrowser = undefined;
    }
}

async function findGenome(dbkey: string) {
    // attempt to match database key to galaxy genomes
    const sources = ["fasta_indexes", "twobit"];
    const dataTableStore = useDataTableStore();
    for (const table of sources) {
        const dataTable = await dataTableStore.getDataTable(table);
        const matchTable = dataTable.find((item) => Array.isArray(item.value?.row) && item.value.row.includes(dbkey));
        if (matchTable) {
            return {
                genome: matchTable.value,
                origin: "builtin",
            };
        }
    }

    // attempt to match database key to igv genomes
    const dataJsonStore = useDataJsonStore();
    const dataJson = await dataJsonStore.getDataJson(IGV_GENOMES);
    const matchJson = dataJson.find((item) => item.value?.id === dbkey);
    if (matchJson) {
        return {
            genome: matchJson.value,
            origin: "igv",
        };
    }

    // could not match a genome
    return null;
}

function getGenome() {
    message.value = "";
    const genome = props.settings.source.genome;
    if (genome) {
        const origin = props.settings.source.origin;
        if (origin === "igv") {
            return genome;
        } else if (origin === "history") {
            if (genome.extension === "fasta") {
                return {
                    id: genome.name,
                    fastaURL: getDatasetUrl(genome.id),
                    indexUrl: getIndexUrl(genome.id, genome.extension),
                };
            } else if (genome.extension === "twobit") {
                return {
                    id: genome.name,
                    twoBitURL: getDatasetUrl(genome.id),
                };
            } else {
                message.value = "References from History must be `fasta` or `twobit`.";
            }
        } else {
            const genomeId = genome.id;
            const columns = genome.columns || [];
            const row = genome.row || [];
            const table = genome.table;
            const pathColumn = columns.indexOf("path");
            if (pathColumn >= 0 && row.length > pathColumn) {
                const fileName = row[pathColumn].split("/").pop();
                const apiPath = `${props.root}api/tool_data/${table}/fields/${genomeId}/files/`;
                if (table === "fasta_indexes") {
                    return {
                        id: genomeId,
                        fastaURL: `${apiPath}${fileName}`,
                        indexURL: `${apiPath}${fileName}.fai`,
                    };
                } else if (table === "twobit") {
                    return {
                        id: genomeId,
                        twoBitURL: `${apiPath}${fileName}`,
                    };
                }
            }
        }
    }
}

function getDatasetUrl(datasetId: string): string {
    if (datasetId === "__test__") {
        return TEST_DATASET_URL;
    } else {
        return `${props.root}api/datasets/${datasetId}/display`;
    }
}

async function getDatasetDetails(datasetId: string): Promise<Dataset | null> {
    if (datasetId === "__test__") {
        return TEST_DATASET_DETAILS;
    } else {
        try {
            const { data } = await GalaxyApi().GET(`/api/datasets/${datasetId}`);
            return data;
        } catch (e) {
            message.value = `Failed to retrieve dataset details for: ${datasetId}`;
            console.error(message.value, e);
            return null;
        }
    }
}

function getIndexUrl(datasetId: string, format: string | null): string | null {
    const metadataKey = format ? CONFIG[format]?.index : null;
    const metadataCheck = metadataKey && datasetId !== "__test__";
    return metadataCheck ? `${props.root}api/datasets/${datasetId}/metadata_file?metadata_file=${metadataKey}` : null;
}

async function loadGenome() {
    const genomeConfig = getGenome();
    if (genomeConfig) {
        loading.value = true;
        try {
            if (igvBrowser) {
                igvBrowser.off("locuschange", locusChange);
                await igvBrowser.loadGenome(genomeConfig);
            } else if (viewport.value) {
                igvBrowser = await igv.createBrowser(viewport.value, { genome: genomeConfig });
            }
            // Refresh view
            await loadTracks(true);
            await locusSearch();
            message.value = "";

            // Attach locus change handler
            igvBrowser.on("locuschange", locusChange);

            // Manually patch style, try to move this into css if possible
            const igvNavBar = igvBrowser.root.querySelector(".igv-navbar");
            if (igvNavBar) {
                Object.assign(igvNavBar.style, {
                    flexFlow: "column",
                    height: "unset",
                    paddingBottom: "3px",
                });
            }
        } catch (e) {
            message.value = "Failed to load genome.";
            console.error(message.value, e);
            dispose();
        }
        loading.value = false;
    }
}

async function loadTracks(force: boolean = false) {
    if (igvBrowser) {
        loading.value = true;
        const newTracks = await tracksResolve();
        console.debug("[igv] Resolved Tracks", newTracks);
        const { toAdd, toRemove } = tracksDiff(newTracks, igvTracks, force);
        for (const old of toRemove) {
            const view = igvBrowser.trackViews.find((tv: any) => tv.track.name === old.name);
            if (view) {
                console.debug(`[igv] Removing existing track '${view.track.name}'`);
                igvBrowser.removeTrack(view.track);
            }
        }
        for (const t of toAdd) {
            try {
                console.debug(`[igv] Adding new track '${t.name}'`);
                await igvBrowser.loadTrack(t);
            } catch (e) {
                console.error(`[igv] Failed to load track '${t.name}'`, e);
            }
        }
        igvBrowser.reorderTracks();
        igvTracks = newTracks.map((t) => ({ ...t }));
        loading.value = false;
    }
}

// Add event listener and update locus
function locusChange() {
    if (igvBrowser) {
        emit("update", { settings: { locus: locusCurrent() } });
    }
}

// Collect current locus from igv
function locusCurrent() {
    if (igvBrowser && igvBrowser.referenceFrameList?.length > 0) {
        const rf = igvBrowser.referenceFrameList[0];
        return `${rf.chr}:${Math.round(rf.start) + 1}-${Math.round(rf.end)}`;
    } else {
        console.error("[igv] Failed to obtain current locus.");
        return undefined;
    }
}

async function locusSearch() {
    if (igvBrowser) {
        const locus = props.settings?.locus;
        if (locusCurrent() !== locus) {
            const target = locus ? locus : "all";
            if (locusValid(target)) {
                try {
                    loading.value = true;
                    await igvBrowser.search(target);
                    loading.value = false;
                } catch {
                    console.warn("[igv] Locus search failed:", target);
                }
            } else {
                console.warn("[igv] Invalid locus ignored:", target);
            }
        }
    } else {
        message.value = "Failed to search.";
        console.error("[igv] Browser not available.");
    }
}

function locusValid(locus: string): boolean {
    const chrPattern = /^[\w.-]+$/;
    const rangePattern = /^([\w.-]+):(\d{1,3}(?:,\d{3})*|\d+)-(\d{1,3}(?:,\d{3})*|\d+)$/;
    if (chrPattern.test(locus)) {
        return true;
    } else {
        const match = locus.match(rangePattern);
        if (match) {
            const start = parseInt(match[2].replace(/,/g, ""), 10);
            const end = parseInt(match[3].replace(/,/g, ""), 10);
            return Number.isInteger(start) && Number.isInteger(end) && start < end;
        } else {
            return false;
        }
    }
}

function trackDrop(event: DragEvent) {
    let invalid = false;
    const droppedDatasets = [];
    const raw = event.dataTransfer?.getData("text");
    try {
        const data = raw ? JSON.parse(raw) : [];
        if (Array.isArray(data) && data.length > 0) {
            const payload = data[0];
            if (payload && typeof payload === "object") {
                const values: Array<Record<string, any>> = payload.id ? [payload] : Object.values(payload);
                for (const entry of values) {
                    if (
                        entry.object?.model_class === "HistoryDatasetAssociation" &&
                        entry.object?.id &&
                        entry.element_identifier
                    ) {
                        droppedDatasets.push({
                            id: entry.object.id,
                            name: entry.element_identifier,
                        });
                    } else if (entry.history_content_type === "dataset" && entry.id) {
                        droppedDatasets.push({
                            id: entry.id,
                            name: entry.name,
                        });
                    } else {
                        invalid = true;
                    }
                }
            } else {
                invalid = true;
            }
        } else {
            invalid = true;
        }
    } catch {
        message.value = "Failed to parse dropped data.";
    }
    if (invalid || droppedDatasets.length === 0) {
        message.value = "Please make sure to only drop valid history datasets.";
        console.debug("[igv] Dropped Content", raw);
    } else {
        const newTracks = [...props.tracks, ...droppedDatasets.map((d) => ({ urlDataset: d }))];
        emit("update", { tracks: newTracks });
        message.value = "";
        console.debug("[igv] Dropped Tracks", newTracks);
    }
    dragging.value = false;
}

function trackHash(track: Track): string {
    const keys = Object.keys(track).sort();
    const str = JSON.stringify(track, keys);
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
}

function trackType(format: string | null): string {
    const normalized = format?.toLowerCase();
    if (normalized) {
        const config = CONFIG[normalized];
        if (config?.type) {
            return config.type;
        }
    }
    return DEFAULT_TYPE;
}

function tracksDiff(newTracks: Track[], existingTracks: Track[], force: boolean = false) {
    const existingMap = new Map(existingTracks.map((t) => [t.name, t]));
    const toRemove = existingTracks.filter((existing) => {
        const candidate = newTracks.find((t) => t.name === existing.name);
        return force || !candidate || trackHash(candidate) !== trackHash(existing);
    });
    const toAdd = newTracks.filter((t) => {
        const existing = existingMap.get(t.name);
        return force || !existing || trackHash(t) !== trackHash(existing);
    });
    return { toAdd, toRemove };
}

async function tracksResolve() {
    // parse tracks
    const parsedTracks: Array<Track> = [];
    for (const t of props.tracks) {
        // populate basic track parameters
        const dataset = t.urlDataset as Dataset;
        const datasetDetails = dataset ? await getDatasetDetails(dataset.id) : null;
        const displayMode = t.displayMode;
        const color = t.color;
        const format = datasetDetails?.extension || null;
        const index = t.indexUrlDataset as Dataset;
        const name = t.name || datasetDetails?.name || "";
        const type = t.type && t.type !== "auto" ? t.type : trackType(format);
        const url = dataset ? getDatasetUrl(dataset.id) : null;
        // identify index source
        const indexURL = index ? getDatasetUrl(index.id) : getIndexUrl(dataset?.id, format);
        // create track configuration
        const trackConfig: Track = { color, displayMode, format, indexURL, name, type, url };
        console.debug("[igv] Track:", trackConfig);
        parsedTracks.push(trackConfig);
    }

    // resolve tracks
    const trackSeen = new Set<string>();
    const nameCounts = new Map<string, number>();
    const resolved: Array<Track> = [];
    parsedTracks.forEach((track, index) => {
        const baseName = track.name || `track-${trackHash(track)}`;
        const trackKey = JSON.stringify({ ...track, name: baseName });
        const isValid = typeof track?.url === "string" && track.url.trim().length > 0;
        const isDuplicateConfig = trackSeen.has(trackKey);
        if (isValid && !isDuplicateConfig) {
            const count = nameCounts.get(baseName) ?? 0;
            let name = baseName;
            if (count > 0) {
                name = `${baseName} ~ ${count}`;
            }
            nameCounts.set(baseName, count + 1);
            trackSeen.add(trackKey);
            resolved.push({ ...track, name, order: -index });
        } else if (!isValid) {
            console.warn(`[igv] Invalid track skipped: '${baseName}'`);
        } else {
            console.warn(`[igv] Duplicate track skipped: '${baseName}'`);
        }
    });
    return resolved;
}
</script>

<template>
    <div
        class="h-screen overflow-auto relative"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="trackDrop">
        <div v-if="dragging" class="igv-overlay border-3 border-dashed border-sky-500 rounded-lg">
            <div class="igv-overlay-title">Drop Track Datasets!</div>
        </div>
        <div v-else-if="loading" class="igv-overlay">
            <div class="igv-overlay-title">Loading Datasets...</div>
        </div>
        <div v-if="message" class="bg-sky-100 border border-sky-200 mt-1 p-2 rounded text-sky-800 text-sm">
            {{ message }}
        </div>
        <div id="viewport" ref="viewport"></div>
        <Modal
            :message="`Using default genome. Please change genome selection in the side panel settings.`"
            :show="showModal"
            title="Genome Selection Required!"
            @close="showModal = false" />
    </div>
</template>
