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
            try {
                // Try to use galaxy-test-data BAM file
                const bamUrl = "https://raw.githubusercontent.com/galaxyproject/galaxy-test-data/master/srma_out2.bam";
                const baiUrl = "https://raw.githubusercontent.com/galaxyproject/galaxy-test-data/master/srma_out2.bai";

                const bamFile = new BamFile({
                    bamUrl: bamUrl,
                    baiUrl: baiUrl,
                });

                const rawHeader = await bamFile.getHeader();
                console.log("Raw BAM Header:", rawHeader);
                console.log("Header type:", typeof rawHeader);
                console.log("Is array:", Array.isArray(rawHeader));

                // Handle both array and object header formats
                let parsedHeader;
                if (Array.isArray(rawHeader)) {
                    console.log("Header is array, parsing...");
                    parsedHeader = {
                        version: "1.6",
                        sortOrder: "unknown",
                        references: [],
                        readGroups: [],
                        programs: [],
                        comments: rawHeader,
                    };

                    // Try to parse header lines for reference sequences
                    rawHeader.forEach((line, index) => {
                        console.log(`Header line ${index}:`, line);

                        if (line && typeof line === "object") {
                            if (line.tag === "HD") {
                                // Header line with version and sort order
                                const hdData = line.data || [];
                                hdData.forEach((field) => {
                                    if (field.tag === "VN") parsedHeader.version = field.value;
                                    if (field.tag === "SO") parsedHeader.sortOrder = field.value;
                                });
                            } else if (line.tag === "SQ") {
                                // Sequence dictionary line
                                const sqData = line.data || [];
                                const refSeq = { name: "unknown", length: 0 };

                                sqData.forEach((field) => {
                                    console.log(`SQ field:`, field);
                                    if (field.tag === "SN") refSeq.name = field.value;
                                    if (field.tag === "LN") refSeq.length = parseInt(field.value) || 0;
                                });

                                parsedHeader.references.push(refSeq);
                                console.log(`Added reference: ${refSeq.name} (${refSeq.length})`);
                            } else if (line.tag === "PG") {
                                // Program line
                                const pgData = line.data || [];
                                const program = { id: "unknown" };

                                pgData.forEach((field) => {
                                    if (field.tag === "ID") program.id = field.value;
                                    if (field.tag === "PN") program.name = field.value;
                                    if (field.tag === "VN") program.version = field.value;
                                    if (field.tag === "CL") program.commandLine = field.value;
                                });

                                parsedHeader.programs.push(program);
                            }
                        }
                    });
                } else {
                    parsedHeader = rawHeader;
                }

                headerInfo.value = parsedHeader;
                console.log("Parsed Header:", parsedHeader);

                const refSeqs = parsedHeader.references;
                console.log("References:", refSeqs);
                console.log("References length:", refSeqs ? refSeqs.length : "undefined");

                // If we successfully got the header, that's already good progress!
                if (!parsedHeader) {
                    throw new Error("Header is null or undefined");
                }

                // For demo purposes, if there are no references, let's still try to show the header info
                if (!refSeqs || refSeqs.length === 0) {
                    console.log("No references found, but header exists - showing header only");
                    records.value = []; // No records to show
                    return; // Exit early but don't throw error
                }

                if (refSeqs && refSeqs.length > 0) {
                    const firstRef = refSeqs[0];
                    const endPos = Math.min(regionEnd.value, firstRef.length);
                    console.log(`Trying to get records for ${firstRef.name}:${regionStart.value}-${endPos}`);

                    try {
                        const bamRecords = await bamFile.getRecordsForRange(firstRef.name, regionStart.value, endPos, {
                            maxRecords: maxRecords.value,
                        });

                        records.value = bamRecords;
                        console.log("BAM Records:", bamRecords);

                        if (bamRecords.length === 0) {
                            console.log("No records found in range, trying broader range");
                            // Try a broader range
                            const broaderRecords = await bamFile.getRecordsForRange(
                                firstRef.name,
                                0,
                                Math.min(100000, firstRef.length),
                                {
                                    maxRecords: maxRecords.value,
                                }
                            );
                            records.value = broaderRecords;
                            console.log("Broader range records:", broaderRecords);

                            if (broaderRecords.length === 0) {
                                throw new Error("No records found in broader range");
                            }
                        }
                    } catch (rangeError) {
                        console.warn("Could not get records for range:", rangeError.message);
                        throw rangeError;
                    }
                } else {
                    console.log("No reference sequences found, falling back to mock data");
                    throw new Error("No references");
                }
            } catch (bamError) {
                console.warn("BAM file loading failed, using mock data:", bamError.message);
                console.warn("Full error:", bamError);

                // Fallback to realistic mock data
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
            }

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
                    console.log("BAM Records:", bamRecords);
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
    console.log("Formatting record:", record);

    // Handle bam-js record format - use getters if available
    let flags = 0;
    try {
        flags = record.flags || 0;
    } catch (e) {
        console.warn("Could not access flags:", e);
        flags = 0;
    }

    const flagNames = [];
    if (flags & 0x1) flagNames.push("paired");
    if (flags & 0x2) flagNames.push("proper_pair");
    if (flags & 0x4) flagNames.push("unmapped");
    if (flags & 0x8) flagNames.push("mate_unmapped");
    if (flags & 0x10) flagNames.push("reverse");
    if (flags & 0x20) flagNames.push("mate_reverse");
    if (flags & 0x40) flagNames.push("read1");
    if (flags & 0x80) flagNames.push("read2");
    if (flags & 0x100) flagNames.push("secondary");
    if (flags & 0x200) flagNames.push("qc_fail");
    if (flags & 0x400) flagNames.push("duplicate");
    if (flags & 0x800) flagNames.push("supplementary");

    // Safely access record properties
    const getName = () => {
        try {
            return record.name || record.qname || "unknown";
        } catch {
            return "unknown";
        }
    };
    const getRefName = () => {
        try {
            return record.refName || record.rname || "unknown";
        } catch {
            return "unknown";
        }
    };
    const getStart = () => {
        try {
            return record.start || record.pos || 0;
        } catch {
            return 0;
        }
    };
    const getEnd = () => {
        try {
            return record.end || record.start + (record.length || 0) || 0;
        } catch {
            return 0;
        }
    };
    const getCigar = () => {
        try {
            return record.cigar || "";
        } catch {
            return "";
        }
    };
    const getSeq = () => {
        try {
            return record.seq || record.sequence || "";
        } catch {
            return "";
        }
    };
    const getQual = () => {
        try {
            return record.qual || record.quality || "";
        } catch {
            return "";
        }
    };
    const getMapq = () => {
        try {
            return record.mapq || record.mapQ || 0;
        } catch {
            return 0;
        }
    };
    const getTags = () => {
        try {
            const tags = record.tags || record.aux || {};
            return Object.entries(tags)
                .map(([k, v]) => `${k}:${v}`)
                .join(";");
        } catch {
            return "";
        }
    };

    return {
        name: getName(),
        refName: getRefName(),
        start: getStart(),
        end: getEnd(),
        cigar: getCigar(),
        seq: getSeq(),
        qual: getQual(),
        flags: flagNames.join(","),
        mapq: getMapq(),
        tags: getTags(),
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

<style scoped>
.bam-viewer {
    text-align: left;
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    background-color: #fff;
    color: #333;
}

.bam-records {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-wrap;
    flex: 1;
    overflow-y: auto;
    color: #333;
    padding: 16px;
    margin: 0;
}

.error {
    color: #d32f2f;
    padding: 16px;
    background-color: #ffebee;
    border: 1px solid #ffcdd2;
    border-radius: 4px;
    margin: 16px;
}

.loading {
    padding: 20px;
    text-align: center;
    color: #666;
}
</style>
