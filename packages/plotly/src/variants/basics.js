import { useColumnsStore } from "galaxy-charts";

const columnsStore = useColumnsStore();

export default async function (datasetId, settings, tracks) {
    const layout = {
        barmode: settings.stack_bar ? "stack" : "group",
        xaxis: {
            title: {
                text: settings.x_axis_label,
            },
        },
        yaxis: {
            title: {
                text: settings.y_axis_label,
            },
        },
    };
    const config = { responsive: true };
    const columnsList = await columnsStore.fetchColumns(datasetId, tracks, ["label", "x", "y"]);
    const data = [];
    columnsList.forEach((columns, index) => {
        const track = tracks[index];
        const mode = ["bar", "lines"].includes(track.type) ? "lines" : "markers";
        const stackgroup = track.type === "lines" && settings.stack_lines ? "stackgroup" : undefined;
        const fill = track.type === "lines" && settings.stack_lines ? "tonexty" : undefined;
        data.push({
            fill: fill,
            marker: {
                color: track.color,
            },
            mode: mode,
            name: track.name,
            stackgroup: stackgroup,
            text: columns.label,
            type: track.type,
            x: columns.x,
            y: columns.y,
        });
    });
    return { data, layout, config };
}
