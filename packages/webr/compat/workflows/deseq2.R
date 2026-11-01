suppressPackageStartupMessages(library(DESeq2))
result <- function(key, value) cat(sprintf("RESULT %s %s\n", key, format(value, digits = 6)))
set.seed(42)

dds <- makeExampleDESeqDataSet(n = 1000, m = 6, betaSD = 1, interceptMean = 6)
dds <- DESeq(dds, quiet = TRUE)
res <- results(dds)

result("significant", sum(res$padj < 0.1, na.rm = TRUE))
result("top_gene", rownames(res)[which.min(res$pvalue)])
