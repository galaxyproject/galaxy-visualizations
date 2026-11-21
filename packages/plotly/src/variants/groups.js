import { useColumnsStore } from "galaxy-charts";
import { schemeColors } from "@/colorSchemes";
import { fetchDataStartOffset, sliceColumns } from "@/describeDataset";
import { panelTitle } from "@/panelTitle";
import { toNumber } from "@/toNumber";

const columnsStore = useColumnsStore();
const collator = new Intl.Collator(undefined, { numeric: true });

export function groupPoints(groups, xs, ys) {
    const byGroup = new Map();
    xs.forEach((rawX, index) => {
        const x = toNumber(rawX);
        const y = toNumber(ys[index]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            const key = String(groups[index] ?? "");
            if (!byGroup.has(key)) {
                byGroup.set(key, { x: [], y: [] });
            }
            byGroup.get(key).x.push(x);
            byGroup.get(key).y.push(y);
        }
    });
    return byGroup;
}

export function groupColors(keys, scheme) {
    const sorted = [...new Set(keys)].sort(collator.compare);
    const colors = schemeColors(scheme, sorted.length) || [];
    return new Map(sorted.map((key, index) => [key, colors[index]]));
}

export default async function (datasetId, settings, tracks) {
    const [dataStartOffset, columnsList] = await Promise.all([
        fetchDataStartOffset(datasetId),
        columnsStore.fetchColumns(datasetId, tracks, ["group", "x", "y"]),
    ]);
    sliceColumns(columnsList, dataStartOffset);
    const panels = columnsList.map((columns, index) =>
        groupPoints(columns.group || columns.x.map(() => tracks[index].name), columns.x, columns.y),
    );
    const colors = groupColors(
        panels.flatMap((byGroup) => [...byGroup.keys()]),
        settings.colorschema,
    );
    const layout = {
        annotations: [],
        grid: { columns: panels.length, pattern: "independent", rows: 1 },
        hovermode: "closest",
        legend: { itemsizing: "constant" },
    };
    const data = [];
    const shown = new Set();
    panels.forEach((byGroup, index) => {
        const suffix = index === 0 ? "" : `${index + 1}`;
        [...colors.keys()].forEach((key) => {
            const points = byGroup.get(key);
            if (points) {
                data.push({
                    hovertemplate: `${key}<br>%{x:.3g}, %{y:.3g}<extra></extra>`,
                    legendgroup: key,
                    marker: { color: colors.get(key), size: Number(settings.point_size ?? 4) },
                    mode: "markers",
                    name: panels.length > 1 ? key : `${key} (${points.x.length})`,
                    showlegend: !shown.has(key),
                    type: "scattergl",
                    x: points.x,
                    xaxis: `x${suffix}`,
                    y: points.y,
                    yaxis: `y${suffix}`,
                });
                shown.add(key);
            }
        });
        if (panels.length > 1) {
            layout.annotations.push(panelTitle(tracks[index].name, suffix));
        }
        layout[`xaxis${suffix}`] = { title: { text: settings.x_axis_label } };
        layout[`yaxis${suffix}`] = {
            scaleanchor: settings.equal_axes ? `x${suffix}` : undefined,
            title: { text: settings.y_axis_label },
        };
    });
    return { data, layout, config: { responsive: true } };
}
