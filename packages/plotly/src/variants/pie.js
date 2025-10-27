import { useColumnsStore } from "galaxy-charts";

const columnsStore = useColumnsStore();

export default async function (datasetId, settings, tracks) {
    const layout = {};
    const config = { responsive: true };
    const columnsList = await columnsStore.fetchColumns(datasetId, tracks, ["labels", "values"]);
    const data = [];
    columnsList.forEach((columns, index) => {
        const track = tracks[index];
        data.push({
            name: `${track.name} (${index + 1})`,
            type: "pie",
            labels: columns.lables,
            values: columns.values,
        });
    });
    return { data, layout, config };
}
