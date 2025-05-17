// Build IGV track configs from Galaxy datasets
import { GalaxyDataSource } from "./GalaxyDataSource.js";

export class GalaxyTrackBuilder {
    static async buildTrack(dataset, options = {}) {
        const trackType = this.getTrackType(dataset.datatype || dataset.file_ext);

        const config = {
            type: trackType,
            format: dataset.datatype || dataset.file_ext,
            name: dataset.name || "Unknown Dataset",
            height: options.height || 200,
            displayMode: options.displayMode || "EXPANDED",
            color: options.color,
            autoHeight: false,
        };

        // For formats that need custom handling (like BAM/CRAM), use our data source
        if (this.requiresGalaxyAdapter(dataset.datatype)) {
            config.sourceType = "custom";
            config.source = new GalaxyDataSource(dataset.id);
        } else {
            // Use direct URL for formats IGV can handle natively
            config.url = `/datasets/${dataset.id}/display`;
        }

        // Add index URLs based on file type (following IGV display app patterns)
        this.addIndexUrl(config, dataset);

        // Add format-specific configurations
        this.addFormatSpecificConfig(config, dataset);

        return config;
    }

    // Add index URLs for BAM/CRAM/VCF
    static addIndexUrl(config, dataset) {
        const datatype = dataset.datatype || dataset.file_ext;

        switch (datatype) {
            case "bam":
                if (dataset.metadata && dataset.metadata.bam_index) {
                    config.indexURL = `/datasets/${dataset.id}/metadata_file?metadata_file=bam_index`;
                }
                break;

            case "cram":
                // CRAM files need .crai index
                if (dataset.metadata && dataset.metadata.cram_index) {
                    config.indexURL = `/datasets/${dataset.id}/metadata_file?metadata_file=cram_index`;
                }
                break;

            case "vcf_bgzip":
                // VCF files need .tbi index
                if (dataset.metadata && dataset.metadata.tabix_index) {
                    config.indexURL = `/datasets/${dataset.id}/metadata_file?metadata_file=tabix_index`;
                }
                break;
        }
    }

    static getTrackType(datatype) {
        const typeMap = {
            bam: "alignment",
            cram: "alignment",
            vcf: "variant",
            vcf_bgzip: "variant",
            bed: "annotation",
            gff: "annotation",
            gff3: "annotation",
            gtf: "annotation",
            bigwig: "wig",
            bigbed: "annotation",
            bedgraph: "wig",
            narrowpeak: "annotation",
            broadpeak: "annotation",
        };
        return typeMap[datatype] || "annotation";
    }

    static requiresGalaxyAdapter(datatype) {
        // These formats benefit from region-based data access
        return ["bam", "cram"].includes(datatype);
    }

    static addFormatSpecificConfig(config, dataset) {
        const datatype = dataset.datatype || dataset.file_ext;

        switch (datatype) {
            case "bam":
            case "cram":
                config.alignmentRowHeight = 14;
                config.coverageTrackHeight = 50;
                config.viewAsPairs = true;
                break;

            case "vcf":
            case "vcf_bgzip":
                config.visibilityWindow = 1000000; // 1MB
                config.displayMode = "EXPANDED";
                break;

            case "bigwig":
            case "bedgraph":
                config.min = 0;
                config.max = "auto";
                config.windowFunction = "mean";
                config.supportsPartialRequest = true;
                break;

            case "bed":
            case "gff":
            case "gtf":
                config.displayMode = dataset.metadata?.lines > 1000 ? "COLLAPSED" : "EXPANDED";
                break;
        }
    }

    static async buildCollectionTracks(collection, options = {}) {
        const tracks = [];

        for (const element of collection.elements) {
            try {
                const track = await this.buildTrack(element.dataset, {
                    ...options,
                    name: `${collection.name} - ${element.element_identifier}`,
                });
                tracks.push(track);
            } catch (error) {
                console.error(`Failed to build track for ${element.element_identifier}:`, error);
            }
        }

        return tracks;
    }
}
