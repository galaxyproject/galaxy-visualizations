import { GalaxyApi } from "galaxy-charts";
import { describeDataset } from "@/describeDataset";

function formatLabels(labels, lng = 9) {
    return labels.map((x, i) => {
        if (x) {
            const str = String(x);
            return str.length > lng ? str.slice(0, lng) + "..." : str;
        } else {
            return i;
        }
    });
}

export default async function (datasetId) {
    // request dataset details
    const params = new URLSearchParams({
        data_type: "raw_data",
        provider: "dataset-column",
    }).toString();
    const { data: metaData } = await GalaxyApi().GET(`/api/datasets/${datasetId}`);
    const { data: rawData } = await GalaxyApi().GET(`/api/datasets/${datasetId}?${params}`);

    const { columnCount, columnNames, hasHeader } = describeDataset(metaData);

    // tsv/csv: row 1 is the header; skip it from data and use column_names
    // for the x-axis. tabular: keep all rows as data and label columns by
    // their integer index (Galaxy doesn't track names for tabular).
    // First column is always treated as row labels for the y-axis.
    const dataRows = hasHeader ? rawData.data.slice(1) : rawData.data;
    const xLabels = hasHeader
        ? columnNames.slice(1)
        : Array.from({ length: Math.max(0, columnCount - 1) }, (_, i) => i + 1);
    const yLabels = dataRows.map((row) => row[0]);
    const zMatrix = dataRows.map((row) => row.slice(1).map((val) => parseFloat(val)));

    const data = [
        {
            x: formatLabels(xLabels),
            y: formatLabels(yLabels),
            z: zMatrix,
            type: "heatmap",
            showscale: true,
            hoverongaps: false,
        },
    ];

    const layout = {
        margin: { l: 100, r: 0, b: 100, t: 20 },
        xaxis: { type: "category" },
        yaxis: { type: "category" },
    };

    const config = { responsive: true };

    const warning =
        rawData.data.length < metaData.metadata_data_lines
            ? `Displaying only the first ${rawData.data.length} rows.`
            : undefined;

    return { data, layout, config, warning };
}
