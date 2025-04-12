import React, { useEffect } from "react";
import KeplerGl from "kepler.gl/components/KeplerGl";
import { Provider } from "react-redux";
import { createStore, combineReducers, applyMiddleware } from "redux";
import keplerGlReducer from "kepler.gl/reducers";
import { addDataToMap, taskMiddleware } from "kepler.gl/actions";
import Papa from "papaparse";

const reducers = combineReducers({
  keplerGl: keplerGlReducer,
});
const store = createStore(reducers, {}, applyMiddleware(taskMiddleware));

export default function App({ url }) {
  useEffect(() => {
    async function loadAndRender() {
      try {
        const res = await fetch(url);
        const contentType = res.headers.get("content-type");
        const text = await res.text();

        if (contentType.includes("application/json") || text.trim().startsWith("{")) {
          // GeoJSON mode
          const geojson = JSON.parse(text);
          if (!geojson.features || !Array.isArray(geojson.features)) {
            throw new Error("Invalid GeoJSON format: missing 'features' array.");
          }

          const dataset = {
            info: { label: "GeoJSON Data", id: "geojson_data" },
            data: geojson,
          };

          store.dispatch(
            addDataToMap({
              datasets: [dataset],
              options: { centerMap: true, readOnly: false },
            })
          );
        } else {
          // CSV mode
          const parsed = Papa.parse(text, { header: true });

          if (parsed.errors.length > 0) {
            throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
          }

          const headers = parsed.meta.fields.map((f) => f.toLowerCase());
          const latCol = headers.find((h) => h === "lat" || h === "latitude");
          const lonCol = headers.find((h) => h === "lon" || h === "lng" || h === "longitude");
          const timeCol = headers.find((h) => h === "timestamp" || h === "time" || h === "date");
          const valueCol = headers.find((h) => h === "value" || h === "score" || h === "count");

          if (!latCol || !lonCol) {
            throw new Error("CSV must include 'lat'/'latitude' and 'lon'/'lng'/'longitude' columns.");
          }

          const datasetId = "csv_data";

          const dataset = {
            info: { label: "CSV Geospatial Data", id: datasetId },
            data: {
              fields: parsed.meta.fields.map((name) => ({ name, type: "string" })),
              rows: parsed.data.map((row) => parsed.meta.fields.map((col) => row[col])),
            },
          };

          const config = {
            config: {
              visState: {
                layers: [
                  {
                    id: "layer_1",
                    type: "point",
                    config: {
                      dataId: datasetId,
                      label: "Value Layer",
                      color: [255, 203, 153],
                      columns: {
                        lat: latCol,
                        lng: lonCol,
                      },
                      isVisible: true,
                      visConfig: {
                        radius: 20,
                        opacity: 0.8,
                        colorRange: {
                          colors: ["#5A1846", "#900C3F", "#C70039", "#FF5733", "#FFC300"],
                        },
                        sizeRange: [0, 50],
                      },
                      ...(valueCol && {
                        colorField: { name: valueCol, type: "real" },
                        sizeField: { name: valueCol, type: "real" },
                      }),
                    },
                  },
                ],
                ...(timeCol && {
                  filters: [
                    {
                      id: "time_filter",
                      dataId: datasetId,
                      name: [timeCol],
                      type: "timeRange",
                      enlarged: true,
                      isAnimating: true,
                      value: null,
                    },
                  ],
                }),
              },
              animation: { enabled: !!timeCol },
            },
          };

          store.dispatch(
            addDataToMap({
              datasets: [dataset],
              options: { centerMap: true, readOnly: false },
              ...config,
            })
          );
        }
      } catch (err) {
        console.error(err);
        const root = document.getElementById("app");
        root.innerHTML = `<div style="padding: 2em; font-family: sans-serif; color: red;">
          <h2>Error loading dataset</h2>
          <p>${err.message}</p>
        </div>`;
      }
    }

    loadAndRender();
  }, [url]);

  return (
    <Provider store={store}>
      <KeplerGl
        id="kepler"
        mapboxApiAccessToken=""
        width={window.innerWidth}
        height={window.innerHeight}
      />
    </Provider>
  );
}
