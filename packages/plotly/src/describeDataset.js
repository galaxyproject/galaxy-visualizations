import { GalaxyApi } from "galaxy-charts";

/* Derive immutable rendering signals from Galaxy's dataset metadata.
 * Galaxy's datatype contract: tsv/csv always have a header (column_names
 * is populated with the first row); plain tabular never has a header.
 * Defensive against metadata_column_names being null (real Galaxy response
 * for plain tabular) and against length mismatches. */
export function describeDataset(metaData) {
    const columnTypes = metaData.metadata_column_types || [];
    const columnCount = Number(metaData.metadata_columns) || columnTypes.length;
    const columnNames = metaData.metadata_column_names;
    const hasHeader = Array.isArray(columnNames) && columnNames.length === columnCount;
    return {
        columnCount,
        columnNames: hasHeader ? columnNames : [],
        columnTypes,
        hasHeader,
        dataStartOffset: hasHeader ? 1 : 0,
    };
}

/* Convenience: fetch dataset metadata and return just the row offset that
 * data starts at (1 when Galaxy reports a header, 0 otherwise). */
export async function fetchDataStartOffset(datasetId) {
    const { data: metaData } = await GalaxyApi().GET(`/api/datasets/${datasetId}`);
    return describeDataset(metaData).dataStartOffset;
}

/* Drop the leading `offset` rows from each track's column arrays in place.
 * Used after columnsStore.fetchColumns to honor Galaxy's header contract
 * without poisoning the store's cache. */
export function sliceColumns(columnsList, offset) {
    if (offset > 0) {
        columnsList.forEach((track) => {
            for (const key in track) {
                track[key] = track[key].slice(offset);
            }
        });
    }
}
