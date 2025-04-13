
import { processGeojson } from "@kepler.gl/processors";

export default async function () {
    const geojson = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [-122.4194, 37.7749], // San Francisco
                },
                properties: {
                    name: "Startup Point",
                },
            },
        ],
    };

    const processed = processGeojson(geojson);

    return {
        info: {
            label: "Startup Dataset",
            id: "startup-dataset",
        },
        data: processed,
    };
}
