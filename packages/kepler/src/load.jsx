import Papa from "papaparse";
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
        const dataset = {
            info: { label: "GeoJSON Data", id: "geojson" },
            data: processGeojson(geojson),
        };
        return { dataset, config: {} };
    } else {
        const parsed = Papa.parse(text, { header: true });

        if (parsed.errors.length > 0) {
            throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
        }

        const originalFields = parsed.meta.fields; // Case-sensitive!
        const firstRow = parsed.data[0];

        const latCol = originalFields.find((f) => ["lat", "latitude"].includes(f.toLowerCase()));
        const lonCol = originalFields.find((f) => ["lon", "lng", "longitude"].includes(f.toLowerCase()));
        const timeCol = originalFields.find((f) => ["timestamp", "time", "date"].includes(f.toLowerCase()));
        const valueCol = originalFields.find((f) => ["value", "score", "count"].includes(f.toLowerCase()));

        if (!latCol || !lonCol) {
            throw new Error("CSV must include 'lat'/'latitude' and 'lon'/'lng'/'longitude' columns.");
        }

        // Infer field types
        const inferType = (name) => {
            const val = firstRow?.[name];
            if (!val) return "string";
            if (!isNaN(Number(val))) return "real";
            if (!isNaN(Date.parse(val))) return "timestamp";
            return "string";
        };

        const dataset = {
            info: { label: "CSV Geospatial Data", id: "csv" },
            data: {
                fields: originalFields.map((name) => ({
                    name,
                    type: inferType(name),
                })),
                rows: parsed.data.map((row) => originalFields.map((col) => row[col])),
            },
        };

        const config = {
            visState: {
                layers: [
                    {
                        id: "test_layer",
                        type: "point",
                        config: {
                            dataId: "csv",
                            label: "Test Layer",
                            columns: {
                                lat: "latitude",
                                lng: "longitude",
                            },
                            isVisible: true,
                            visConfig: {
                                radius: 15,
                                opacity: 0.8,
                                colorRange: {
                                    colors: ["#5A1846", "#900C3F", "#C70039", "#FF5733", "#FFC300"],
                                },
                                sizeRange: [0, 50],
                            },
                            colorField: { name: "value", type: "real" },
                            sizeField: { name: "value", type: "real" },
                        },
                    },
                ],
                filters: [
                    {
                        id: "time_filter",
                        dataId: "csv",
                        name: ["timestamp"],
                        type: "timeRange",
                        enlarged: true,
                        isAnimating: true,
                        value: null,
                    },
                ],
            },
            animation: { enabled: true },
        };

        return { dataset, config };
    }
}
