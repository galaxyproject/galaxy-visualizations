import { GalaxyApi } from "galaxy-charts";

export default async function (datasetId) {
    const params = new URLSearchParams({
        data_type: "raw_data",
        provider: "dataset-column",
    }).toString();
    const { data: zData } = await GalaxyApi().GET(`/api/datasets/${datasetId}?${params}`);
    const config = { responsive: true };
    const data = [
        {
            z: zData.data,
            type: "surface",
        },
    ];
    const layout = {};
    return { data, layout, config };
}
