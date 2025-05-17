// Galaxy data source for IGV.js
export class GalaxyDataSource {
    constructor(datasetId, galaxyRoot = "") {
        this.datasetId = datasetId;
        this.galaxyRoot = galaxyRoot;
        this.metadata = null;
    }

    async getHeader() {
        if (!this.metadata) {
            const response = await fetch(`${this.galaxyRoot}/api/datasets/${this.datasetId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch dataset metadata: ${response.status}`);
            }
            this.metadata = await response.json();
        }
        return this.metadata;
    }

    // Read data for genomic region (Trackster pattern)
    async read(chr, start, end) {
        const url = `${this.galaxyRoot}/datasets/${this.datasetId}/display`;

        const params = new URLSearchParams({
            chrom: chr,
            low: start,
            high: end,
            data_type: "data",
            mode: "Auto",
        });

        const response = await fetch(`${url}?${params}`, {
            headers: {
                Accept: "application/octet-stream",
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status}`);
        }

        return response.arrayBuffer();
    }

    // Byte-range requests for BGZ files
    async readRange(start, end) {
        const url = `${this.galaxyRoot}/datasets/${this.datasetId}/display`;

        const response = await fetch(url, {
            headers: {
                Range: `bytes=${start}-${end}`,
            },
        });

        if (!response.ok && response.status !== 206) {
            throw new Error(`Failed to fetch data range: ${response.status}`);
        }

        return response.arrayBuffer();
    }

    async readFeatures(chr, start, end) {
        return this.read(chr, start, end);
    }
}
