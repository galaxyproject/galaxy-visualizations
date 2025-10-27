import { useColumnsStore } from "galaxy-charts";
import COLOR_SCHEMES from "@/colors.json";

const MARGIN = 30;
const XGAP = 0.1;
const YGAP = 0.3;

const columnsStore = useColumnsStore();

function generateColors(baseColors, count, delta = 0.15) {
    if (!Array.isArray(baseColors) || baseColors.length === 0) {
        return undefined;
    }
    const colors = [];
    const steps = Math.ceil(count / baseColors.length);
    for (let i = 0; i < steps; i++) {
        for (const base of baseColors) {
            const match = base.match(/\d+/g);
            if (!match) {
                continue;
            }
            const [r, g, b] = match.map(Number);
            const factor = Math.max(0, 1 - i * delta);
            const c = `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
            colors.push(c);
            if (colors.length >= count) {
                return colors.slice(0, count);
            }
        }
    }
    return colors;
}

export default async function (datasetId, settings, tracks) {
    const columnsList = await columnsStore.fetchColumns(datasetId, tracks, ["labels", "values"]);
    const count = columnsList.length;
    if (count === 0) {
        return { data: [], layout: {}, config: { responsive: true } };
    }
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const annotations = [];
    const layout = {
        annotations,
        legend: { traceorder: "normal" },
        grid: { rows, columns, xgap: XGAP, ygap: YGAP },
        margin: { l: MARGIN, r: MARGIN, t: MARGIN, b: MARGIN },
        showlegend: Boolean(settings.showlegend),
    };
    const config = { responsive: true };
    const data = [];
    const xDomainWidth = (1 - ((columns - 1) * XGAP) / columns) / columns;
    const yDomainHeight = (1 - ((rows - 1) * YGAP) / rows) / rows;
    const maxChars = Math.floor((xDomainWidth / (1 / columns)) * 20);
    columnsList.forEach((columnsData, index) => {
        const track = tracks[index] || { name: `Track ${index + 1}` };
        const row = Math.floor(index / columns);
        const column = index % columns;
        const valueCount = columnsData.values.length;
        const base = COLOR_SCHEMES[settings.colorschema];
        const colors =
            settings.colorschema && settings.colorschema !== "plotly" && base
                ? generateColors(base, valueCount)
                : undefined;
        data.push({
            automargin: true,
            domain: { row, column },
            hole: settings.hole,
            hoverinfo: settings.hoverinfo || "label+value+percent",
            labels: columnsData.labels,
            marker: { colors },
            name: `${track.name} (${index + 1})`,
            sort: Boolean(settings.sort),
            textinfo: settings.textinfo || "label+percent",
            textposition: "inside",
            type: "pie",
            values: columnsData.values,
        });
        const x = (column + 0.5) * xDomainWidth + (column * XGAP) / columns;
        const y = 1 - ((row + 1) * yDomainHeight + (row * YGAP) / rows);
        let label = track.name;
        if (label.length > maxChars) {
            label = label.slice(0, maxChars - 1) + "…";
        }
        annotations.push({
            font: { size: 12 },
            showarrow: false,
            text: label,
            x,
            xanchor: "center",
            xref: "paper",
            y,
            yanchor: "top",
            yref: "paper",
        });
    });
    return { data, layout, config };
}
