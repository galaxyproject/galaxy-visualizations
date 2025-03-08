import { useColumnsStore } from "galaxy-charts";

const columnsStore = useColumnsStore();

export default async function (datasetId, settings, tracks) {
    const layout = {
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
    const columnsList = await columnsStore.fetchColumns(datasetId, tracks, ["y"]);
    const data = [];
    columnsList.forEach((columns, index) => {
        const track = tracks[index];
        data.push({
            marker: {
                color: track.color,
            },
            name: `${track.name} (${index + 1})`,
            type: "box",
            y: columns.y,
        });
    });
    return { data, layout, config };
}
