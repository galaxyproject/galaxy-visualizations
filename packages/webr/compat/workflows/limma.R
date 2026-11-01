suppressPackageStartupMessages(library(limma))
result <- function(key, value) cat(sprintf("RESULT %s %s\n", key, format(value, digits = 6)))
set.seed(42)

counts <- matrix(rnbinom(6000, mu = 100, size = 10), nrow = 1000)
counts[1:50, 4:6] <- counts[1:50, 4:6] * 4
rownames(counts) <- paste0("gene", 1:1000)
group <- factor(rep(c("a", "b"), each = 3))
design <- model.matrix(~group)
fit <- eBayes(lmFit(voom(counts, design), design))
table <- topTable(fit, coef = 2, number = Inf)

result("significant", sum(table$adj.P.Val < 0.05))
result("top_gene", rownames(table)[1])
result("top_logFC", table$logFC[1])
