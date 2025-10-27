import { useColumnsStore } from "galaxy-charts";

const columnsStore = useColumnsStore();

export default async function (datasetId, settings, tracks) {
    const columnsList = await columnsStore.fetchColumns(datasetId, tracks, ["labels", "values"]);
    const count = columnsList.length;
    const side = Math.ceil(Math.sqrt(count));
    const layout = { grid: { rows: side, columns: side } };
    const config = { responsive: true };
    const data = [];
    columnsList.forEach((columns, index) => {
        const track = tracks[index];
        const row = Math.floor(index / side);
        const column = index % side;
        data.push({
            name: `${track.name} (${index + 1})`,
            type: "pie",
            hoverinfo: "label+percent",
            hole: settings.hole,
            labels: columns.labels,
            values: columns.values,
            domain: { row, column },
        });
    });
    return { data, layout, config };
}
