import { useColumnsStore } from "galaxy-charts";

const MARGIN = 30;
const XGAP = 0.15;
const YGAP = 0.25;

const columnsStore = useColumnsStore();

export default async function (datasetId, settings, tracks) {
    const columnsList = await columnsStore.fetchColumns(datasetId, tracks, ["labels", "values"]);
    const count = columnsList.length;
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const layout = {
        grid: { rows, columns, xgap: XGAP, ygap: YGAP },
        margin: { l: MARGIN, r: MARGIN, t: MARGIN, b: MARGIN },
    };
    const config = { responsive: true };
    const data = [];
    columnsList.forEach((columnsData, index) => {
        const track = tracks[index];
        const row = Math.floor(index / columns);
        const column = index % columns;
        data.push({
            name: `${track.name} (${index + 1})`,
            type: "pie",
            hoverinfo: "label+percent",
            textinfo: "percent",
            textposition: "inside",
            automargin: true,
            hole: settings.hole,
            labels: columnsData.labels,
            values: columnsData.values,
            domain: { row, column },
        });
    });
    return { data, layout, config };
}
