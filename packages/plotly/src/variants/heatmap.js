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
    const params = new URLSearchParams({
        data_type: "raw_data",
        provider: "dataset-column",
    }).toString();
    const { data: rawData } = await GalaxyApi().GET(`/api/datasets/${datasetId}?${params}`);

    // first row is x-axis labels (skip first column)
    const xLabels = rawData.data[0].slice(1);

    // first column is y-axis labels (skip first row)
    const yLabels = rawData.data.slice(1).map((row) => row[0]);

    // rest is z matrix
    const zMatrix = rawData.data.slice(1).map((row) => row.slice(1).map((val) => parseFloat(val)));

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
