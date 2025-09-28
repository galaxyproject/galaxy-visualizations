<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import igv from "igv";
import { LastQueue } from "./lastQueue";
import { GalaxyApi, useDataTableStore, useDataJsonStore } from "galaxy-charts";
import CONFIG from "./config.yml";

const DEFAULT_TYPE = "annotation";
const DELAY = 500;
const URL = "https://s3.amazonaws.com/igv.org.genomes/genomes.json";

type Atomic = string | number | boolean | null | undefined;

interface Dataset {
    id: string;
    name: string;
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
    datasetUrl: string;
    root: string;
    settings: {
        locus: string;
        source: {
            from_igv: string;
            genome: any;
        };
    };
    specs: Record<string, unknown>;
    tracks: Track[];
}>();

// Emit events with TypeScript
const emit = defineEmits<{
    (event: "update", newSettings: any, newTracks: any): void;
}>();

const message = ref("");
const viewport = ref<HTMLDivElement | null>(null);

let igvBrowser: any = null;
let igvTracks: Array<Track> = [];
let parsedTracks: Array<Track> = [];

onMounted(() => {
    create();
});

onBeforeUnmount(() => {
    if (igvBrowser && typeof igvBrowser.dispose === "function") {
        igvBrowser.dispose();
    }
});

watch(
    () => props.tracks,
    () => lastQueue.enqueue(tracksParse, undefined, "tracksParse"),
    { deep: true, immediate: true },
);

watch(
    () => props.settings.source?.genome,
    () => lastQueue.enqueue(loadGenome, undefined, "loadGenome"),
);

watch(
    () => props.settings.locus,
    () => lastQueue.enqueue(locusSearch, undefined, "locusSearch"),
);

function getGenome() {
    const genome = props.settings.source.genome;
    if (genome) {
        if (props.settings.source.from_igv === "true") {
            return genome;
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

async function create() {
    if (props.datasetId && !props.settings.source.genome) {
        // access stores
        const dataTableStore = useDataTableStore();
        const dataJsonStore = useDataJsonStore();

        // collect dataset details
        const { data: dataset } = await GalaxyApi().GET(`/api/datasets/${props.datasetId}`);
        const dbkey = dataset.metadata_dbkey;

        // prep source
        let source = null;

        // attempt to match database key to fasta_indexes
        const dataTable = await dataTableStore.getDataTable("fasta_indexes");
        const dbkeyIndex = dataTable[0]?.value?.columns.indexOf("dbkey");
        const matchTable = dataTable.find(
            (item) => dbkeyIndex >= 0 && item.value?.row[dbkeyIndex] === dbkey
        );
        if (matchTable) {
            source = {
                from_igv: "false",
                genome: matchTable.value,
            };
        }

        // attempt to match database key to igv genomes
        if (!source) {
            const dataJson = await dataJsonStore.getDataJson(URL);
            const matchJson = dataJson.find((item) => item.value?.id === dbkey);
            if (matchJson) {
                source = {
                    from_igv: "true",
                    genome: matchJson.value,
                }
            }
        }

        // emit update
        const newSettings = source ? { source } : {};
        const newTracks = [{ urlDataset: { id: dataset.id } }];
        emit("update", newSettings, newTracks);
        console.error("[igv] Updating values.", newSettings, newTracks);
    } else {
        console.error("[igv] Skipping genome matching.");
    }
}

async function getDatasetType(datasetId: string): Promise<string | null> {
    try {
        const { data } = await GalaxyApi().GET(`/api/datasets/${datasetId}`);
        return data.extension;
    } catch (e) {
        message.value = `Failed to retrieve dataset type for: ${datasetId}`;
        console.error(message.value, e);
        return null;
    }
}

function getDatasetUrl(datasetId: string): string {
    return `${props.root}api/datasets/${datasetId}/display`;
}

function getIndexUrl(datasetId: string, format: string | null): string | null {
    const metadataKey = format ? CONFIG[format]?.index : null;
    return metadataKey ? `${props.root}api/datasets/${datasetId}/metadata_file?metadata_file=${metadataKey}` : null;
}

async function loadGenome() {
    const genomeConfig = getGenome();
    if (genomeConfig) {
        try {
            if (igvBrowser) {
                await igvBrowser.loadGenome(genomeConfig);
            } else if (viewport.value) {
                igvBrowser = await igv.createBrowser(viewport.value, { genome: genomeConfig });
            }

            // Refresh view
            await tracksLoad(true);
            await locusSearch();
            message.value = "";

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
        }
    }
}

async function locusSearch() {
    const locus = props.settings.locus;
    if (igvBrowser) {
        if (!locus) {
            await igvBrowser.search("all");
        } else if (locusValid(locus)) {
            try {
                await igvBrowser.search(locus);
            } catch {
                console.warn("[igv] Invalid locus ignored:", locus);
            }
        }
    } else {
        message.value = "Failed to search.";
        console.error("[igv] Browser not available.");
    }
}

function locusValid(locus: string): boolean {
    const chrPattern = /^[\w.-]+$/;
    const rangePattern = /^[\w.-]+:\d{1,3}(,\d{3})*-\d{1,3}(,\d{3})*$/;
    return chrPattern.test(locus) || rangePattern.test(locus);
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

async function tracksLoad(force: boolean = false) {
    if (igvBrowser) {
        const newTracks = tracksResolve(parsedTracks);
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
    }
}

async function tracksParse() {
    parsedTracks = [];
    if (props.tracks) {
        for (const t of props.tracks) {
            // populate basic track parameters
            const dataset = t.urlDataset as Dataset;
            const displayMode = t.displayMode;
            const color = t.color;
            const format = dataset ? await getDatasetType(dataset.id) : null;
            const index = t.indexUrlDataset as Dataset;
            const name = t.name;
            const type = t.type && t.type !== "auto" ? t.type : trackType(format);
            const url = dataset ? getDatasetUrl(dataset.id) : null;
            // identify index source
            const indexURL = index ? getDatasetUrl(index.id) : getIndexUrl(dataset?.id, format);
            // create track configuration
            const trackConfig: Track = { color, displayMode, format, indexURL, name, type, url };
            console.debug("[igv] Track:", trackConfig);
            parsedTracks.push(trackConfig);
        }
    }
    tracksLoad();
}

function tracksResolve(rawTracks: Array<Track>) {
    const trackSeen = new Set<string>();
    const nameCounts = new Map<string, number>();
    const resolved: Array<Track> = [];
    rawTracks.forEach((track, index) => {
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
            resolved.push({ ...track, name, order: index });
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
    <div class="h-screen overflow-auto">
        <div v-if="message" class="bg-sky-100 border border-sky-200 p-1 rounded text-sky-800 text-sm">
            {{ message }}
        </div>
        <div ref="viewport"></div>
    </div>
</template>
