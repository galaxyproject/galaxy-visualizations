import { useColumnsStore } from "galaxy-charts";

const MARGIN = 30;
const XGAP = 0.1;
const YGAP = 0.3;

const columnsStore = useColumnsStore();

export default async function (datasetId, settings, tracks) {
    const columnsList = await columnsStore.fetchColumns(datasetId, tracks, ["labels", "values"]);
    const count = columnsList.length;
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const annotations = [];
    const layout = {
        grid: { rows, columns, xgap: XGAP, ygap: YGAP },
        margin: { l: MARGIN, r: MARGIN, t: MARGIN, b: MARGIN },
        annotations,
    };
    const config = { responsive: true };
    const data = [];
    const xDomainWidth = (1 - ((columns - 1) * XGAP) / columns) / columns;
    const yDomainHeight = (1 - ((rows - 1) * YGAP) / rows) / rows;
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
        const x = (column + 0.5) * xDomainWidth + (column * XGAP) / columns;
        const y = 1 - ((row + 1) * yDomainHeight + (row * YGAP) / rows);
        annotations.push({
            text: track.name,
            xref: "paper",
            yref: "paper",
            x,
            y,
            showarrow: false,
            font: { size: 12 },
            xanchor: "center",
            yanchor: "top",
        });
    });
    return { data, layout, config };
}
