import { processGeojson } from "@kepler.gl/processors";

export default async function (url) {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type");
    const text = await res.text();
    if (contentType.includes("application/json") || contentType.includes("application/geo+json")) {
        const geojson = JSON.parse(text);
        if (!geojson.features || !Array.isArray(geojson.features)) {
            throw new Error("Invalid GeoJSON format: missing 'features' array.");
        }
        return {
            info: {
                label: "GeoJSON Data",
                id: "geojson",
            },
            data: processGeojson(geojson),
        };
    }
    return {};
}
