export const DATA = {
    "limma.tsv": {
        url: "https://zenodo.org/api/records/2529117/files/limma-voom_luminalpregnant-luminallactate/content",
        sha256: "9395852e4f531fea9d5bd2fa112580068fd784b75ad67895612e33e74d755f2d",
    },
    "pbmc3k.tar.gz": {
        url: "https://cf.10xgenomics.com/samples/cell/pbmc3k/pbmc3k_filtered_gene_bc_matrices.tar.gz",
        sha256: "847d6ebd9a1ec9a768f2be7e40ca42cbfe75ebeb6d76a4c24167041699dc28b5",
    },
};

export const WORKFLOWS = [
    { id: "tidyverse", packages: ["tidyverse"], data: ["limma.tsv"] },
    { id: "phyloseq", packages: ["phyloseq", "vegan", "ggplot2"], data: [] },
    { id: "seurat", packages: ["Seurat"], data: ["pbmc3k.tar.gz"] },
    {
        id: "scater",
        packages: ["SingleCellExperiment", "scuttle", "scater", "bluster", "uwot", "sparseMatrixStats"],
        data: ["pbmc3k.tar.gz"],
    },
    { id: "limma", packages: ["limma"], data: [] },
    { id: "deseq2", packages: ["DESeq2"], data: [] },
];
