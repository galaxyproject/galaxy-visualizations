import { useColumnsStore } from "galaxy-charts";
import { fetchDataStartOffset, sliceColumns } from "@/describeDataset";

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
    const [dataStartOffset, columnsList] = await Promise.all([
        fetchDataStartOffset(datasetId),
        columnsStore.fetchColumns(datasetId, tracks, ["x"]),
    ]);
    sliceColumns(columnsList, dataStartOffset);
    const data = [];
    columnsList.forEach((columns, index) => {
        const track = tracks[index];
        data.push({
            marker: {
                color: track.color,
            },
            name: `${track.name} (${index + 1})`,
            type: "histogram",
            x: columns.x,
        });
    });
    return { data, layout, config };
}
