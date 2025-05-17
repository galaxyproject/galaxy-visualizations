// Map Galaxy dbkeys to IGV genomes
export class GalaxyGenomeMapper {
    // Mapping of common Galaxy dbkeys to IGV genome IDs
    static genomeMap = {
        hg38: "hg38",
        hg19: "hg19",
        hg18: "hg18",
        mm10: "mm10",
        mm9: "mm9",
        dm6: "dm6",
        dm3: "dm3",
        ce11: "ce11",
        ce10: "ce10",
        danRer11: "danRer11",
        danRer10: "danRer10",
        panTro6: "panTro6",
        gorGor6: "gorGor6",
        anasPlat1: "anasPlat1",
        galGal6: "galGal6",
        tair10: "tair10",
        sacCer3: "sacCer3",
    };

    static async getIGVGenome(galaxyDbkey) {
        if (this.genomeMap[galaxyDbkey]) {
            return this.genomeMap[galaxyDbkey];
        }

        try {
            const response = await fetch(`/api/genomes/${galaxyDbkey}`);
            if (response.ok) {
                const genomeInfo = await response.json();

                // Attempt to construct IGV genome from Galaxy data
                return {
                    id: galaxyDbkey,
                    name: genomeInfo.description || genomeInfo.name,
                    fastaURL: `/api/genomes/${galaxyDbkey}/fasta`,
                    indexURL: `/api/genomes/${galaxyDbkey}/fasta.fai`,
                    cytobandURL: genomeInfo.cytoband_url,
                    aliasURL: genomeInfo.alias_url,
                };
            }
        } catch (error) {
            console.warn(`Failed to fetch genome ${galaxyDbkey}:`, error);
        }

        console.warn(`Unknown Galaxy dbkey: ${galaxyDbkey}, using as-is`);
        return galaxyDbkey;
    }

    static async getAvailableGenomes() {
        try {
            const response = await fetch("/api/genomes");
            if (response.ok) {
                const genomes = await response.json();
                return genomes.map((g) => ({
                    id: g.id,
                    name: g.description || g.name,
                    dbkey: g.id,
                }));
            }
        } catch (error) {
            console.error("Failed to fetch available genomes:", error);
        }
        return [];
    }
}
