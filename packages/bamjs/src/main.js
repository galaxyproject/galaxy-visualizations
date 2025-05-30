import { BamFile } from "@gmod/bam";
import { RemoteFile } from "generic-filehandle2";
import axios from "axios";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV && appElement) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: import.meta.env.VITE_DATASET_ID || "test-bam-dataset",
            max_records: "50",
            region_start: "0",
            region_end: "10000",
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

class BamViewer {
    constructor(container, options = {}) {
        this.container = container;
        this.datasetUrl = options.datasetUrl;
        this.settings = {
            max_records: 100,
            region_start: 0,
            region_end: 10000,
            ...options.settings,
        };

        this.loading = false;
        this.error = null;
        this.headerInfo = null;
        this.records = [];

        this.init();
    }

    init() {
        this.container.className = "bam-viewer";
        this.container.innerHTML = "";
        this.addStyles();

        // Log the settings being used
        console.info("BAM Viewer settings:", this.settings);

        this.loadBamFile();
    }

    addStyles() {
        if (!document.getElementById("bam-viewer-styles")) {
            const style = document.createElement("style");
            style.id = "bam-viewer-styles";
            style.textContent = `
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
                
                .bam-error {
                    color: #d32f2f;
                    padding: 16px;
                    background-color: #ffebee;
                    border: 1px solid #ffcdd2;
                    border-radius: 4px;
                    margin: 16px;
                }
                
                .bam-loading {
                    padding: 20px;
                    text-align: center;
                    color: #666;
                }
            `;
            document.head.appendChild(style);
        }
    }

    render() {
        if (this.loading) {
            this.container.innerHTML = '<div class="bam-loading">Loading BAM file...</div>';
        } else if (this.error) {
            this.container.innerHTML = `<div class="bam-error">${this.error}</div>`;
        } else if (this.headerInfo || this.records.length > 0) {
            const headerText = this.headerInfo ? this.formatHeader(this.headerInfo) : "";
            const recordsText = this.records.length > 0 ? this.formatRecords(this.records) : "";
            this.container.innerHTML = `<div class="bam-records">${headerText}${recordsText}</div>`;
        } else {
            this.container.innerHTML = '<div class="bam-loading">No BAM data available</div>';
        }
    }

    async loadBamFile() {
        this.loading = true;
        this.error = null;
        this.render();

        console.log("Loading BAM file from URL:", this.datasetUrl);
        console.log("Is development mode:", import.meta.env.DEV);

        try {
            if (import.meta.env.DEV && this.datasetUrl.startsWith("https://raw.githubusercontent.com")) {
                console.log("Using HTTP BAM file loader for development");
                await this.loadHttpBamFile();
            } else {
                console.log("Using Galaxy BAM file loader for production");
                await this.loadGalaxyBamFile();
            }
        } catch (err) {
            this.error = `Error loading BAM file: ${err.message}`;
            console.error("BAM loading error:", err);
        } finally {
            this.loading = false;
            this.render();
        }
    }

    async loadHttpBamFile() {
        const bamUrl = this.datasetUrl;

        try {
            // Use RemoteFile for browser compatibility as per @gmod/bam docs
            let baiUrl = null;
            if (bamUrl.includes("raw.githubusercontent.com/galaxyproject/galaxy-test-data/master/srma_out2.bam")) {
                // Use the raw.githubusercontent.com version for the BAI file as well
                baiUrl = "https://raw.githubusercontent.com/galaxyproject/galaxy-test-data/master/srma_out2.bai";
            } else if (bamUrl.endsWith(".bam")) {
                // For other URLs, try standard .bai extension
                baiUrl = bamUrl + ".bai";
            }

            const bamFile = new BamFile({
                bamFilehandle: new RemoteFile(bamUrl),
                baiFilehandle: baiUrl ? new RemoteFile(baiUrl) : undefined,
            });

            // Required: run getHeader before any getRecordsForRange
            const rawHeader = await bamFile.getHeader();
            this.headerInfo = this.parseHeader(rawHeader);

            const refSeqs = this.headerInfo.references;
            if (refSeqs && refSeqs.length > 0) {
                const firstRef = refSeqs[0];
                const endPos = Math.min(this.settings.region_end, firstRef.length);

                try {
                    const bamRecords = await bamFile.getRecordsForRange(
                        firstRef.name,
                        this.settings.region_start,
                        endPos,
                        { maxRecords: this.settings.max_records }
                    );

                    this.records = bamRecords;

                    if (bamRecords.length === 0) {
                        // Try a broader range if no records found
                        const broaderRecords = await bamFile.getRecordsForRange(
                            firstRef.name,
                            0,
                            Math.min(100000, firstRef.length),
                            { maxRecords: this.settings.max_records }
                        );
                        this.records = broaderRecords;
                    }
                } catch (rangeError) {
                    console.warn("Could not get records for range:", rangeError.message);
                    this.records = [];
                }
            } else {
                this.records = [];
            }
        } catch (bamError) {
            console.warn("BAM file loading failed, trying without index:", bamError.message);

            // Try without index using RemoteFile
            try {
                const bamFile = new BamFile({
                    bamFilehandle: new RemoteFile(bamUrl),
                    // No baiFilehandle = no index
                });
                this.headerInfo = await bamFile.getHeader();
                this.records = [];
            } catch (noIndexError) {
                throw noIndexError;
            }
        }
    }

    async loadGalaxyBamFile() {
        // We already have the dataset ID and root from data-incoming
        const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
        const datasetId = incoming.visualization_config?.dataset_id;
        const root = incoming.root || "/";

        console.log("Galaxy data incoming:", incoming);
        console.log("Dataset ID:", datasetId);
        console.log("Root URL:", root);

        if (!datasetId) {
            throw new Error("No dataset ID provided by Galaxy");
        }

        // Construct proper Galaxy API URLs
        const bamUrl = `${root}api/datasets/${datasetId}/display?to_ext=bam`;
        const baiUrl = `${root}api/datasets/${datasetId}/metadata_file?metadata_file=bam_index`;

        console.log("BAM URL:", bamUrl);
        console.log("BAI URL:", baiUrl);

        try {
            // Try with index first
            console.log("Attempting to load with BAI index");
            
            // Log the actual file size if possible
            try {
                const response = await fetch(bamUrl, { method: 'HEAD' });
                const contentLength = response.headers.get('content-length');
                console.log("BAM file size:", contentLength, "bytes");
                
                if (contentLength && parseInt(contentLength) < 100000) {
                    console.log("Small BAM file detected, trying full download approach");
                    
                    // Download both BAM and BAI files entirely
                    const bamResponse = await fetch(bamUrl);
                    const bamData = await bamResponse.arrayBuffer();
                    console.log("Downloaded entire BAM file:", bamData.byteLength, "bytes");
                    
                    const baiResponse = await fetch(baiUrl);
                    const baiData = await baiResponse.arrayBuffer();
                    console.log("Downloaded entire BAI file:", baiData.byteLength, "bytes");
                    
                    // Create a filehandle that works with the downloaded buffer
                    // Try to match RemoteFile interface more closely
                    const bamFilehandle = {
                        async read(buffer, offset = 0, length, position = 0) {
                            console.log("Custom read called:", { buffer, offset, length, position });
                            
                            // Handle the case where buffer is a number (length)
                            if (typeof buffer === 'number') {
                                const requestedLength = buffer;
                                const start = position || 0;
                                const end = Math.min(start + requestedLength, bamData.byteLength);
                                const actualLength = end - start;
                                
                                if (actualLength <= 0) {
                                    return { bytesRead: 0, buffer: new Uint8Array(0) };
                                }
                                
                                // Return the actual slice of data
                                const result = new Uint8Array(bamData, start, actualLength);
                                console.log("Returning slice:", actualLength, "bytes, type:", result.constructor.name);
                                return { bytesRead: actualLength, buffer: result };
                            }
                            
                            // Handle normal buffer case
                            const start = position || 0;
                            const requestedLength = length || buffer.length;
                            const end = Math.min(start + requestedLength, bamData.byteLength);
                            const actualLength = end - start;
                            
                            if (actualLength <= 0) {
                                return { bytesRead: 0, buffer };
                            }
                            
                            const slice = new Uint8Array(bamData, start, actualLength);
                            buffer.set(slice, offset);
                            
                            console.log("Read into provided buffer:", actualLength, "bytes");
                            return { bytesRead: actualLength, buffer };
                        },
                        async stat() {
                            return { size: bamData.byteLength };
                        },
                        async readFile() {
                            return new Uint8Array(bamData);
                        },
                        async close() {
                            // No-op for in-memory file
                        }
                    };
                    
                    // Create a similar filehandle for the BAI file
                    const baiFilehandle = {
                        async read(buffer, offset = 0, length, position = 0) {
                            console.log("Custom BAI read called:", { buffer, offset, length, position });
                            
                            // Handle the case where buffer is a number (length)
                            if (typeof buffer === 'number') {
                                const requestedLength = buffer;
                                const start = position || 0;
                                const end = Math.min(start + requestedLength, baiData.byteLength);
                                const actualLength = end - start;
                                
                                if (actualLength <= 0) {
                                    return { bytesRead: 0, buffer: new Uint8Array(0) };
                                }
                                
                                // Return the actual slice of data
                                const result = new Uint8Array(baiData, start, actualLength);
                                console.log("Returning BAI slice:", actualLength, "bytes, type:", result.constructor.name);
                                return { bytesRead: actualLength, buffer: result };
                            }
                            
                            // Handle normal buffer case
                            const start = position || 0;
                            const requestedLength = length || buffer.length;
                            const end = Math.min(start + requestedLength, baiData.byteLength);
                            const actualLength = end - start;
                            
                            if (actualLength <= 0) {
                                return { bytesRead: 0, buffer };
                            }
                            
                            const slice = new Uint8Array(baiData, start, actualLength);
                            buffer.set(slice, offset);
                            
                            console.log("Read BAI into provided buffer:", actualLength, "bytes");
                            return { bytesRead: actualLength, buffer };
                        },
                        async stat() {
                            return { size: baiData.byteLength };
                        },
                        async readFile() {
                            return new Uint8Array(baiData);
                        },
                        async close() {
                            // No-op for in-memory file
                        }
                    };
                    
                    const bamFile = new BamFile({
                        bamFilehandle,
                        baiFilehandle,
                    });
                    
                    console.log("Getting BAM header with downloaded file...");
                    this.headerInfo = await bamFile.getHeader();
                    console.log("BAM header loaded:", this.headerInfo);
                } else {
                    throw new Error("File too large for workaround");
                }
            } catch (e) {
                console.log("Full download approach failed, falling back to RemoteFile:", e.message);
                
                // Fallback to original approach
                const bamFilehandle = new RemoteFile(bamUrl);
                const baiFilehandle = new RemoteFile(baiUrl);
                
                const bamFile = new BamFile({
                    bamFilehandle,
                    baiFilehandle,
                });
                
                console.log("Getting BAM header with RemoteFile...");
                this.headerInfo = await bamFile.getHeader();
                console.log("BAM header loaded:", this.headerInfo);
            }

            const refSeqs = this.headerInfo.references;
            if (refSeqs && refSeqs.length > 0) {
                const firstRef = refSeqs[0];
                const endPos = Math.min(this.settings.region_end, firstRef.length);

                console.log(`Attempting to get records for ${firstRef.name}:${this.settings.region_start}-${endPos}`);

                try {
                    const bamRecords = await bamFile.getRecordsForRange(
                        firstRef.name,
                        this.settings.region_start,
                        endPos,
                        { maxRecords: this.settings.max_records }
                    );

                    console.log(`Retrieved ${bamRecords.length} records`);
                    this.records = bamRecords;

                    if (bamRecords.length === 0) {
                        console.log("No records found, trying broader range");
                        // Try a broader range if no records found
                        const broaderRecords = await bamFile.getRecordsForRange(
                            firstRef.name,
                            0,
                            Math.min(100000, firstRef.length),
                            { maxRecords: this.settings.max_records }
                        );
                        console.log(`Retrieved ${broaderRecords.length} records with broader range`);
                        this.records = broaderRecords;
                    }
                } catch (rangeError) {
                    console.warn("Could not get records for range:", rangeError.message);
                    this.records = [];
                }
            } else {
                console.log("No reference sequences found");
                this.records = [];
            }
        } catch (bamError) {
            console.error("BAM file loading with index failed:", bamError.message);
            throw bamError;
        }
    }

    parseHeader(rawHeader) {
        // Handle both array and object header formats
        if (Array.isArray(rawHeader)) {
            const parsedHeader = {
                version: "1.6",
                sortOrder: "unknown",
                references: [],
                readGroups: [],
                programs: [],
                comments: rawHeader,
            };

            // Parse header lines for reference sequences
            rawHeader.forEach((line) => {
                if (line && typeof line === "object") {
                    if (line.tag === "HD") {
                        const hdData = line.data || [];
                        hdData.forEach((field) => {
                            if (field.tag === "VN") parsedHeader.version = field.value;
                            if (field.tag === "SO") parsedHeader.sortOrder = field.value;
                        });
                    } else if (line.tag === "SQ") {
                        const sqData = line.data || [];
                        const refSeq = { name: "unknown", length: 0 };

                        sqData.forEach((field) => {
                            if (field.tag === "SN") refSeq.name = field.value;
                            if (field.tag === "LN") refSeq.length = parseInt(field.value) || 0;
                        });

                        parsedHeader.references.push(refSeq);
                    } else if (line.tag === "PG") {
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

            return parsedHeader;
        } else {
            return rawHeader;
        }
    }

    formatRecord(record) {
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
                const seq = record.seq || record.sequence || "";
                // Ensure sequence is a string
                return typeof seq === "string" ? seq : String(seq);
            } catch {
                return "";
            }
        };
        const getQual = () => {
            try {
                const qual = record.qual || record.quality || "";
                // Handle both string and array formats for quality scores
                if (typeof qual === "string") {
                    return qual;
                } else if (Array.isArray(qual)) {
                    // Convert array of quality scores to string
                    return qual.map((q) => String.fromCharCode(q + 33)).join("");
                } else {
                    return String(qual);
                }
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

    formatHeader(header) {
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

    formatRecords(recordList) {
        if (!recordList || recordList.length === 0) {
            return "No records found in the specified region.";
        }

        let output = `\nBAM Records (showing ${recordList.length} records):\n`;
        output += "=".repeat(50) + "\n\n";

        recordList.forEach((record, index) => {
            const formatted = this.formatRecord(record);
            output += `Record ${index + 1}:\n`;
            output += `  Name: ${formatted.name}\n`;
            output += `  Reference: ${formatted.refName}\n`;
            output += `  Position: ${formatted.start}-${formatted.end}\n`;
            output += `  CIGAR: ${formatted.cigar}\n`;
            output += `  MAPQ: ${formatted.mapq}\n`;
            output += `  Flags: ${formatted.flags}\n`;
            if (formatted.seq && typeof formatted.seq === "string") {
                output += `  Sequence: ${formatted.seq.substring(0, 100)}${formatted.seq.length > 100 ? "..." : ""}\n`;
            }
            if (formatted.qual && typeof formatted.qual === "string") {
                output += `  Quality: ${formatted.qual.substring(0, 100)}${formatted.qual.length > 100 ? "..." : ""}\n`;
            }
            if (formatted.tags) {
                output += `  Tags: ${formatted.tags}\n`;
            }
            output += "\n";
        });

        return output;
    }
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

// Extract dataset information
const datasetId = incoming.visualization_config?.dataset_id;
const root = incoming.root || "/";

// Extract settings from Galaxy configuration
const config = incoming.visualization_config || {};
const settings = {
    max_records: parseInt(config.max_records) || 100,
    region_start: parseInt(config.region_start) || 0,
    region_end: parseInt(config.region_end) || 10000,
};

// Build the data request URL
let datasetUrl;
if (import.meta.env.DEV) {
    // In development, use direct URL to BAM file
    datasetUrl = "https://raw.githubusercontent.com/galaxyproject/galaxy-test-data/master/srma_out2.bam";
} else {
    // In production, Galaxy must provide a dataset ID
    if (!datasetId) {
        throw new Error("No dataset ID provided by Galaxy");
    }
    datasetUrl = `${root}api/datasets/${datasetId}/display`;
}

// Initialize the viewer when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("app") || document.body;

    const options = {
        datasetUrl: datasetUrl,
        settings: settings,
    };

    new BamViewer(container, options);
});

// Export for use in Galaxy
window.BamViewer = BamViewer;
