suppressPackageStartupMessages(library(tidyverse))
data_dir <- Sys.getenv("COMPAT_DATA", "/data")
result <- function(key, value) cat(sprintf("RESULT %s %s\n", key, format(value, digits = 6)))

results <- read_tsv(file.path(data_dir, "limma.tsv"), show_col_types = FALSE)
results <- results %>%
    mutate(
        significant = adj.P.Val < 0.01 & abs(logFC) > 0.58,
        direction = case_when(
            significant & logFC > 0 ~ "up",
            significant & logFC < 0 ~ "down",
            TRUE ~ "ns"
        )
    )
top <- results %>% filter(significant) %>% arrange(P.Value) %>% slice_head(n = 10)
summary <- results %>% group_by(direction) %>% summarise(n = n(), mean_logFC = mean(logFC))
long <- results %>% select(SYMBOL, logFC, AveExpr) %>% pivot_longer(-SYMBOL)
families <- results %>%
    filter(!is.na(SYMBOL)) %>%
    mutate(family = str_extract(SYMBOL, "^[A-Za-z]+")) %>%
    count(family, sort = TRUE)

print(
    ggplot(results, aes(logFC, -log10(P.Value), colour = direction)) +
        geom_point(size = 0.5) +
        geom_text(data = top, aes(label = SYMBOL), colour = "black", size = 3, vjust = -0.5) +
        theme_minimal()
)
print(ggplot(summary, aes(direction, n, fill = direction)) + geom_col())

result("rows", nrow(results))
result("up", summary$n[summary$direction == "up"])
result("down", summary$n[summary$direction == "down"])
result("top_gene", top$SYMBOL[1])
result("mean_logFC_up", summary$mean_logFC[summary$direction == "up"])
result("long_rows", nrow(long))
result("top_family", families$family[1])
