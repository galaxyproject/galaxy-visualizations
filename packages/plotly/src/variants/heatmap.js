import { GalaxyApi } from "galaxy-charts";

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

    // data parameters
    let xLabels = [];
    let yLabels = rawData.data.map((row) => row[0]);
    let zMatrix = rawData.data;

    // data comes from tabular not from csv (metadata missing)
    if (metaData.metadata_columns === metaData.metadata_column_names.length) {
        xLabels = metaData.metadata_column_names.slice(1);
        // remove first column from yLabels
        yLabels = yLabels.slice(1);
        // remove first row from zMatrix (contains column names)
        zMatrix = zMatrix.slice(1);
    } else {
        xLabels = Array.from({ length: metaData.metadata_columns - 1 }, (_, i) => i);
    }

    // remove first column from zMatrix and format values
    zMatrix = zMatrix.map((row) => row.slice(1).map((val) => parseFloat(val)));

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

    return { data, layout, config };
}
