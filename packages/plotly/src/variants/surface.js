import { GalaxyApi } from "galaxy-charts";
import { describeDataset } from "@/describeDataset";

export default async function (datasetId) {
    const params = new URLSearchParams({
        data_type: "raw_data",
        provider: "dataset-column",
    }).toString();
    const [{ data: metaData }, { data: zData }] = await Promise.all([
        GalaxyApi().GET(`/api/datasets/${datasetId}`),
        GalaxyApi().GET(`/api/datasets/${datasetId}?${params}`),
    ]);
    const { dataStartOffset } = describeDataset(metaData);
    // Plotly surface expects a pure numeric matrix; every column is a z
    // value. The tsv/csv header (when Galaxy reports one) is dropped, the
    // rest of the rows are used verbatim. Datasets with a row-label column
    // should be preprocessed (e.g. Galaxy's Cut tool) before plotting.
    const matrix = zData.data.slice(dataStartOffset).map((row) => row.map((val) => parseFloat(val)));
    const config = { responsive: true };
    const data = [
        {
            z: matrix,
            type: "surface",
        },
    ];
    const layout = {
        margin: {
            l: 0,
            r: 0,
            b: 0,
            t: 0,
        },
    };
    return { data, layout, config };
}
