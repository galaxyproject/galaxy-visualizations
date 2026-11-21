import COLOR_SCHEMES from "@/colors.json";

function generateColors(baseColors, count, delta = 0.15, shades = 4) {
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
            const factor = 1 - (i % shades) * delta;
            const c = `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
            colors.push(c);
            if (colors.length >= count) {
                return colors.slice(0, count);
            }
        }
    }
    return colors;
}

export function schemeColors(scheme, count) {
    return generateColors(COLOR_SCHEMES[scheme], count);
}
