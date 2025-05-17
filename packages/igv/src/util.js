// A request to api/genomes:

// [
// ["unspecified (?)", "?"],
// ["A. gambiae Feb. 2003 (IAGEC MOZ2/anoGam1) (anoGam1)", "anoGam1"],
// ["A. mellifera Jan. 2005 (Baylor 2.0/apiMel2) (apiMel2)", "apiMel2"],
// ["A. mellifera July 2004 (Baylor 1.2/apiMel1) (apiMel1)", "apiMel1"],
// ];

// A mapping of Galaxy dbkeys to IGV.js genome identifiers
const GENOME_MAPPING = {
    // Human genomes
    hg19: "hg19",
    hg38: "hg38",
    // Mouse genomes
    mm9: "mm9",
    mm10: "mm10",
    mm39: "mm39",
    // Other common genomes
    dm6: "dm6", // Drosophila
    sacCer3: "sacCer3", // Yeast
    ce11: "ce11", // C. elegans
    danRer11: "danRer11", // Zebrafish
    tair10: "tair10", // Arabidopsis
    // The list can be extended as needed
};

// Get genome reference from Galaxy dbkey
export async function getGenomeReference(dbkey) {
    if (!dbkey) return "hg38";

    if (GENOME_MAPPING[dbkey]) return GENOME_MAPPING[dbkey];

    // If not, try to get from Galaxy API
    try {
        const response = await fetch("/api/genomes");
        if (!response.ok) {
            throw new Error(`Error fetching genomes: ${response.statusText}`);
        }

        const genomes = await response.json();

        // Look for a match in the genomes list
        const matchedGenome = genomes.find((genome) => genome[1] === dbkey);
        if (matchedGenome) {
            // Try to check if this genome is available through Galaxy's genome API
            try {
                // Check if we can get basic information about this genome
                const genomeInfoResponse = await fetch(`/api/genomes/${dbkey}`);
                if (genomeInfoResponse.ok) {
                    return dbkey;
                }
            } catch {}
        }

        return dbkey || "hg38";
    } catch (error) {
        console.error("Error getting genome reference:", error);

        return dbkey || "hg38";
    }
}

// Get track config based on datatype
export function determineTrackType(datatype) {
    let trackType = "annotation";
    let datasetFormat = datatype;
    let requiresIndex = false;

    switch (datatype) {
        case "bam":
            trackType = "alignment";
            datasetFormat = "bam";
            requiresIndex = true;
            break;
        case "cram":
            trackType = "alignment";
            datasetFormat = "cram";
            requiresIndex = false;
            break;
        case "vcf":
        case "vcf_bgzip":
            trackType = "variant";
            datasetFormat = "vcf";
            requiresIndex = false;
            break;
        case "bed":
        case "bedgraph":
        case "gtf":
        case "gff":
        case "gff3":
            trackType = "annotation";
            datasetFormat = datatype;
            requiresIndex = false;
            break;
        case "bigwig":
        case "bigWig":
        case "bw":
            trackType = "wig";
            datasetFormat = "bigwig";
            requiresIndex = false;
            break;
        case "bigbed":
        case "bigBed":
        case "bb":
            trackType = "annotation";
            datasetFormat = "bigbed";
            requiresIndex = false;
            break;
        default:
            // For unknown types, try to use generic track
            console.warn(`Unrecognized dataset format: ${datatype}, using generic annotation track`);
            trackType = "annotation";
            datasetFormat = "bed";
            requiresIndex = false;
    }

    return { trackType, datasetFormat, requiresIndex };
}

// Helper function to get proper index URL based on datatype
export function getIndexUrl(datasetId, datatype) {
    // For BAM files, the index might be served directly
    if (datatype === "bam") {
        return `/datasets/${datasetId}/index`;
    } else if (datatype === "cram") {
        return `/datasets/${datasetId}/index`;
    } else if (datatype === "vcf" || datatype === "vcf_bgzip") {
        return `/datasets/${datasetId}/index`;
    } else if (datatype === "bam_index") {
        // If Galaxy has a separate bam_index datatype
        return `/datasets/${datasetId}/display`;
    }
    return undefined;
}

// Function to create a track configuration based on dataset and datatype
export function createTrackConfig(dataset, datasetFormat, trackType, datasetUrl, indexUrl) {
    // Basic track configuration
    const trackConfig = {
        name: dataset.name || "Dataset",
        type: trackType,
        format: datasetFormat,
        url: datasetUrl,
        indexURL: indexUrl,
        color: "#1f77b4",
        visibilityWindow: 1000000,
        displayMode: "EXPANDED",
    };

    // Customize based on track type
    if (trackType === "alignment") {
        trackConfig.alignmentRowHeight = 10;
        trackConfig.sort = {
            position: "base",
            direction: "ASC",
        };
        trackConfig.colorBy = "strand";
    } else if (trackType === "variant") {
        trackConfig.displayMode = "EXPANDED";
        trackConfig.color = "#4c97ef";
    }

    return trackConfig;
}
