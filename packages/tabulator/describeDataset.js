const LINES = 99999;

/* Derive immutable rendering signals from Galaxy's dataset metadata.
 * Galaxy's datatype contract: tsv/csv always have a header (column_names
 * is the first row); plain tabular never has a header. The dataset-column
 * provider splits and type-coerces server-side per column_types, so the
 * client just needs to know how many rows to skip and what to title each
 * column with. */
export function describeDataset(dataset) {
    const columnTypes = dataset.metadata_column_types || [];
    const columnCount = Number(dataset.metadata_columns) || columnTypes.length;
    const columnNames = dataset.metadata_column_names;
    const hasHeader = columnCount > 0 && Array.isArray(columnNames) && columnNames.length === columnCount;
    const titles = hasHeader ? columnNames : columnTypes;
    const columnTitles = Array.from({ length: columnCount }, (_, i) => titles[i] ?? "");
    const totalDataRows = (dataset.metadata_data_lines || LINES) - (hasHeader ? 1 : 0);
    return { columnCount, columnTitles, dataStartOffset: hasHeader ? 1 : 0, totalDataRows };
}
