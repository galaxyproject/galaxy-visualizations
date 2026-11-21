import { useColumnsStore } from "galaxy-charts";
import { fetchDataStartOffset, sliceColumns } from "@/describeDataset";
import { panelTitle } from "@/panelTitle";
import { toNumber } from "@/toNumber";

const columnsStore = useColumnsStore();

export function classifyPoints(labels, foldChanges, pValues, foldThreshold, pThreshold) {
    const result = { down: [], none: [], up: [], maxFold: foldThreshold, maxScore: 0 };
    const zeroP = [];
    foldChanges.forEach((rawFold, index) => {
        const fold = toNumber(rawFold);
        const p = toNumber(pValues[index]);
        if (Number.isFinite(fold) && p >= 0 && p <= 1) {
            const significant = p < pThreshold && Math.abs(fold) >= foldThreshold;
            const key = significant ? (fold > 0 ? "up" : "down") : "none";
            const point = { fold, label: labels ? String(labels[index]) : `${index + 1}`, p, score: 0 };
            if (p > 0) {
                point.score = -Math.log10(p);
                result.maxScore = Math.max(result.maxScore, point.score);
            } else {
                zeroP.push(point);
            }
            result.maxFold = Math.max(result.maxFold, Math.abs(fold));
            result[key].push(point);
        }
    });
    result.maxScore = result.maxScore || 1;
    zeroP.forEach((point) => {
        point.score = result.maxScore;
    });
    return result;
}

export function topLabels(groups, count) {
    return [...groups.up, ...groups.down].sort((a, b) => a.p - b.p).slice(0, Math.max(0, count));
}

export default async function (datasetId, settings, tracks) {
    const foldThreshold = Number(settings.fold_threshold ?? 1);
    const pThreshold = Number(settings.p_threshold ?? 0.05);
    const labelCount = Number(settings.label_count ?? 10);
    const colors = { down: settings.down_color, none: settings.none_color, up: settings.up_color };
    const names = { down: "down", none: "not significant", up: "up" };
    const [dataStartOffset, columnsList] = await Promise.all([
        fetchDataStartOffset(datasetId),
        columnsStore.fetchColumns(datasetId, tracks, ["label", "x", "y"]),
    ]);
    sliceColumns(columnsList, dataStartOffset);
    const panels = columnsList.length;
    const layout = {
        annotations: [],
        grid: { columns: panels, pattern: "independent", rows: 1 },
        hovermode: "closest",
        showlegend: true,
    };
    const data = [];
    columnsList.forEach((columns, index) => {
        const track = tracks[index];
        const suffix = index === 0 ? "" : `${index + 1}`;
        const groups = classifyPoints(columns.label, columns.x, columns.y, foldThreshold, pThreshold);
        ["none", "down", "up"].forEach((key) => {
            const points = groups[key];
            data.push({
                customdata: points.map((point) => point.p),
                hovertemplate: `%{text}<br>${settings.x_axis_label} %{x:.3g}<br>p %{customdata:.3g}<extra></extra>`,
                legendgroup: key,
                marker: { color: colors[key], size: key === "none" ? 4 : 6 },
                mode: "markers",
                name: names[key],
                showlegend: index === 0,
                text: points.map((point) => point.label),
                type: "scattergl",
                x: points.map((point) => point.fold),
                xaxis: `x${suffix}`,
                y: points.map((point) => point.score),
                yaxis: `y${suffix}`,
            });
        });
        topLabels(groups, labelCount).forEach((point, rank) => {
            layout.annotations.push({
                arrowhead: 0,
                ax: point.fold > 0 ? 24 : -24,
                ay: -14 - (rank % 3) * 12,
                font: { size: 10 },
                showarrow: true,
                text: point.label,
                x: point.fold,
                xref: `x${suffix}`,
                y: point.score,
                yref: `y${suffix}`,
            });
        });
        if (panels > 1) {
            layout.annotations.push(panelTitle(track.name, suffix));
        }
        layout[`xaxis${suffix}`] = {
            title: { text: `${settings.x_axis_label}<br>${groups.up.length} up, ${groups.down.length} down` },
            zeroline: false,
        };
        layout[`yaxis${suffix}`] = { title: { text: settings.y_axis_label } };
        const pLine = -Math.log10(pThreshold);
        data.push({
            hoverinfo: "skip",
            line: { color: "#888", dash: "dot", width: 1 },
            mode: "lines",
            showlegend: false,
            type: "scatter",
            x: [
                -foldThreshold,
                -foldThreshold,
                null,
                foldThreshold,
                foldThreshold,
                null,
                -groups.maxFold,
                groups.maxFold,
            ],
            xaxis: `x${suffix}`,
            y: [0, groups.maxScore, null, 0, groups.maxScore, null, pLine, pLine],
            yaxis: `y${suffix}`,
        });
    });
    return { data, layout, config: { responsive: true } };
}
