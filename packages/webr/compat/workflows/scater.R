suppressPackageStartupMessages({
    library(SingleCellExperiment)
    library(scuttle)
    library(scater)
    library(bluster)
    library(Matrix)
})
data_dir <- Sys.getenv("COMPAT_DATA", "/data")
result <- function(key, value) cat(sprintf("RESULT %s %s\n", key, format(value, digits = 6)))
set.seed(42)

extracted <- file.path(tempdir(), "pbmc3k")
untar(file.path(data_dir, "pbmc3k.tar.gz"), exdir = extracted, tar = "internal")
matrix_dir <- file.path(extracted, "filtered_gene_bc_matrices/hg19")
counts <- as(readMM(file.path(matrix_dir, "matrix.mtx")), "CsparseMatrix")
genes <- read.delim(file.path(matrix_dir, "genes.tsv"), header = FALSE)
barcodes <- read.delim(file.path(matrix_dir, "barcodes.tsv"), header = FALSE)
sce <- SingleCellExperiment(
    list(counts = counts),
    rowData = DataFrame(ID = genes$V1, Symbol = genes$V2),
    colData = DataFrame(Barcode = barcodes$V1)
)
rownames(sce) <- uniquifyFeatureNames(rowData(sce)$ID, rowData(sce)$Symbol)

qc <- perCellQCMetrics(sce, subsets = list(Mito = grepl("^MT-", rownames(sce))))
discard <- quickPerCellQC(qc, sub.fields = "subsets_Mito_percent")
colData(sce) <- cbind(colData(sce), qc)
sce <- sce[, !discard$discard]
sce <- logNormCounts(sce)
variances <- MatrixGenerics::rowVars(logcounts(sce))
hvg <- names(sort(variances, decreasing = TRUE))[1:2000]
sce <- runPCA(sce, ncomponents = 20, subset_row = hvg)
sce <- runUMAP(sce, dimred = "PCA")
colLabels(sce) <- clusterRows(reducedDim(sce, "PCA"), NNGraphParam(cluster.fun = "louvain"))

print(plotReducedDim(sce, "UMAP", colour_by = "label"))
print(plotColData(sce, x = "sum", y = "detected"))

result("cells_kept", ncol(sce))
result("discarded", sum(discard$discard))
result("median_sum", median(colSums(counts(sce))))
result("pc1_percent_var", attr(reducedDim(sce, "PCA"), "percentVar")[1])
result("clusters", length(unique(colLabels(sce))))
