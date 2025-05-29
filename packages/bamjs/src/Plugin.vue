<script setup>
import { BamFile } from "@gmod/bam";
import axios from "axios";
import { computed, onMounted, ref, watch } from "vue";

const props = defineProps({
    root: String,
    tracks: Array,
    datasetId: String,
    datasetUrl: String,
    settings: {
        type: Object,
        default: () => ({
            max_records: 100,
            region_start: 0,
            region_end: 10000,
        }),
    },
    specs: Object,
});

const loading = ref(false);
const error = ref(null);
const bamData = ref(null);
const headerInfo = ref(null);
const records = ref([]);

const maxRecords = computed(() => props.settings?.max_records || 100);
const regionStart = computed(() => props.settings?.region_start || 0);
const regionEnd = computed(() => props.settings?.region_end || 10000);

async function loadBamFile() {
    loading.value = true;
    error.value = null;

    try {
        if (props.datasetUrl.startsWith("mock://")) {
            headerInfo.value = {
                version: "1.6",
                sortOrder: "coordinate",
                references: [
                    { name: "chr1", length: 248956422 },
                    { name: "chr2", length: 242193529 },
                    { name: "chrX", length: 156040895 },
                ],
                readGroups: [{ id: "HG001", sample: "NA12878", library: "lib_HG001", platform: "ILLUMINA" }],
                programs: [
                    {
                        id: "bwa",
                        name: "bwa",
                        version: "0.7.17",
                        commandLine: "bwa mem -M -t 16 GRCh38.fa input.fastq",
                    },
                ],
            };

            records.value = [
                {
                    name: "HWI-D00119:50:H7AP8ADXX:1:1101:1234:2000",
                    refName: "chr1",
                    start: 69091,
                    end: 69141,
                    cigar: "50M",
                    seq: "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC",
                    qual: "JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ",
                    flags: 99,
                    mapq: 60,
                    tags: { AS: 50, XS: 10, NM: 0, MD: "50" },
                },
                {
                    name: "HWI-D00119:50:H7AP8ADXX:1:1101:1234:2000",
                    refName: "chr1",
                    start: 69141,
                    end: 69191,
                    cigar: "50M",
                    seq: "CGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT",
                    qual: "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIJ",
                    flags: 147,
                    mapq: 60,
                    tags: { AS: 50, XS: 8, NM: 0, MD: "50" },
                },
                {
                    name: "HWI-D00119:50:H7AP8ADXX:1:1101:5678:2500",
                    refName: "chr2",
                    start: 158312,
                    end: 158362,
                    cigar: "25M1I24M",
                    seq: "GACTGCAGACTGCAGACTGCAGAACTGCAGACTGCAGACTGCAGACTGCAG",
                    qual: "HHHHHHHHHHHHHHHHHHHHHHHHHGGGGGGGGGGGGGGGGGGGGGGGGGGG",
                    flags: 0,
                    mapq: 42,
                    tags: { AS: 48, XS: 5, NM: 1, MD: "25^A24" },
                },
                {
                    name: "HWI-D00119:50:H7AP8ADXX:1:1101:9012:3000",
                    refName: "chr1",
                    start: 52381,
                    end: 52426,
                    cigar: "45M5S",
                    seq: "TGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC",
                    qual: "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF?????",
                    flags: 16,
                    mapq: 23,
                    tags: { AS: 40, XS: 15, NM: 2, MD: "20A10T14" },
                },
            ];

            return;
        }

        if (props.datasetUrl.startsWith("http")) {
            let bamFile;

            try {
                bamFile = new BamFile({
                    bamUrl: props.datasetUrl,
                    baiUrl: props.datasetUrl + ".bai",
                });

                headerInfo.value = await bamFile.getHeader();
            } catch (indexError) {
                console.warn("Index file not found, trying without index:", indexError.message);

                bamFile = new BamFile({
                    bamUrl: props.datasetUrl,
                });

                headerInfo.value = await bamFile.getHeader();
            }

            const refSeqs = headerInfo.value.references;
            if (refSeqs && refSeqs.length > 0) {
                const firstRef = refSeqs[0];
                const endPos = Math.min(regionEnd.value, firstRef.length);

                try {
                    const bamRecords = await bamFile.getRecordsForRange(firstRef.name, regionStart.value, endPos, {
                        maxRecords: maxRecords.value,
                    });

                    records.value = bamRecords;
                } catch (rangeError) {
                    console.warn("Could not get records for range:", rangeError.message);
                    records.value = [];
                }
            }
        } else {
            const response = await axios.get(props.datasetUrl);

            if (response.data.download_url) {
                const bamFile = new BamFile({
                    bamUrl: response.data.download_url,
                });

                headerInfo.value = await bamFile.getHeader();

                const refSeqs = headerInfo.value.references;
                if (refSeqs && refSeqs.length > 0) {
                    const firstRef = refSeqs[0];
                    const endPos = Math.min(regionEnd.value, firstRef.length);

                    const bamRecords = await bamFile.getRecordsForRange(firstRef.name, regionStart.value, endPos, {
                        maxRecords: maxRecords.value,
                    });

                    records.value = bamRecords;
                }
            } else {
                error.value = "Unable to access BAM file data";
            }
        }
    } catch (err) {
        error.value = `Error loading BAM file: ${err.message}`;
        console.error("BAM loading error:", err);
    } finally {
        loading.value = false;
    }
}

function formatRecord(record) {
    const flags = [];
    if (record.flags & 0x1) flags.push("paired");
    if (record.flags & 0x2) flags.push("proper_pair");
    if (record.flags & 0x4) flags.push("unmapped");
    if (record.flags & 0x8) flags.push("mate_unmapped");
    if (record.flags & 0x10) flags.push("reverse");
    if (record.flags & 0x20) flags.push("mate_reverse");
    if (record.flags & 0x40) flags.push("read1");
    if (record.flags & 0x80) flags.push("read2");
    if (record.flags & 0x100) flags.push("secondary");
    if (record.flags & 0x200) flags.push("qc_fail");
    if (record.flags & 0x400) flags.push("duplicate");
    if (record.flags & 0x800) flags.push("supplementary");

    return {
        name: record.name || "unknown",
        refName: record.refName || "unknown",
        start: record.start,
        end: record.end,
        cigar: record.cigar || "",
        seq: record.seq || "",
        qual: record.qual || "",
        flags: flags.join(","),
        mapq: record.mapq || 0,
        tags: record.tags
            ? Object.entries(record.tags)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(";")
            : "",
    };
}

function formatHeader(header) {
    let output = "BAM Header Information:\n";
    output += "======================\n\n";

    if (header.version) {
        output += `Version: ${header.version}\n`;
    }

    if (header.sortOrder) {
        output += `Sort Order: ${header.sortOrder}\n`;
    }

    if (header.groupOrder) {
        output += `Group Order: ${header.groupOrder}\n`;
    }

    output += "\nReference Sequences:\n";
    output += "-------------------\n";
    if (header.references) {
        header.references.forEach((ref, index) => {
            output += `${index + 1}. ${ref.name} (length: ${ref.length})\n`;
        });
    }

    if (header.readGroups && header.readGroups.length > 0) {
        output += "\nRead Groups:\n";
        output += "------------\n";
        header.readGroups.forEach((rg, index) => {
            output += `${index + 1}. ID: ${rg.id}\n`;
            if (rg.sample) output += `   Sample: ${rg.sample}\n`;
            if (rg.library) output += `   Library: ${rg.library}\n`;
            if (rg.platform) output += `   Platform: ${rg.platform}\n`;
        });
    }

    if (header.programs && header.programs.length > 0) {
        output += "\nPrograms:\n";
        output += "---------\n";
        header.programs.forEach((prog, index) => {
            output += `${index + 1}. ID: ${prog.id}\n`;
            if (prog.name) output += `   Name: ${prog.name}\n`;
            if (prog.version) output += `   Version: ${prog.version}\n`;
            if (prog.commandLine) output += `   Command: ${prog.commandLine}\n`;
        });
    }

    return output;
}

function formatRecords(recordList) {
    if (!recordList || recordList.length === 0) {
        return "No records found in the specified region.";
    }

    let output = `\nBAM Records (showing ${recordList.length} records):\n`;
    output += "=".repeat(50) + "\n\n";

    recordList.forEach((record, index) => {
        const formatted = formatRecord(record);
        output += `Record ${index + 1}:\n`;
        output += `  Name: ${formatted.name}\n`;
        output += `  Reference: ${formatted.refName}\n`;
        output += `  Position: ${formatted.start}-${formatted.end}\n`;
        output += `  CIGAR: ${formatted.cigar}\n`;
        output += `  MAPQ: ${formatted.mapq}\n`;
        output += `  Flags: ${formatted.flags}\n`;
        if (formatted.seq) {
            output += `  Sequence: ${formatted.seq.substring(0, 100)}${formatted.seq.length > 100 ? "..." : ""}\n`;
        }
        if (formatted.qual) {
            output += `  Quality: ${formatted.qual.substring(0, 100)}${formatted.qual.length > 100 ? "..." : ""}\n`;
        }
        if (formatted.tags) {
            output += `  Tags: ${formatted.tags}\n`;
        }
        output += "\n";
    });

    return output;
}

watch(() => props.datasetUrl, loadBamFile);

onMounted(() => {
    if (props.datasetUrl) {
        loadBamFile();
    }
});
</script>

<template>
    <div class="bam-viewer">
        <div v-if="loading" class="loading">Loading BAM file...</div>

        <div v-else-if="error" class="error">
            {{ error }}
        </div>

        <div v-else-if="headerInfo || records.length > 0" class="bam-records">
            <div v-if="headerInfo">{{ formatHeader(headerInfo) }}</div>
            <div v-if="records.length > 0">{{ formatRecords(records) }}</div>
        </div>

        <div v-else class="loading">No BAM data available</div>
    </div>
</template>
