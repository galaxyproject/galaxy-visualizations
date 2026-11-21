export function panelTitle(text, suffix) {
    return {
        showarrow: false,
        text,
        x: 0.5,
        xanchor: "center",
        xref: `x${suffix} domain`,
        y: 1,
        yanchor: "bottom",
        yref: `y${suffix} domain`,
    };
}
