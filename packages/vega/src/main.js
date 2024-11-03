import { createApp, h } from "vue";
import "./style.css";
import App from "./App.vue";

const chartSpec = `{
    "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
    "width": "container",
    "height": "container",
    "data": {
        "values": [
        { "a": "A", "b": 28 },
        { "a": "B", "b": 55 },
        { "a": "C", "b": 43 },
        { "a": "D", "b": 91 },
        { "a": "E", "b": 81 },
        { "a": "F", "b": 53 },
        { "a": "G", "b": 19 },
        { "a": "H", "b": 87 },
        { "a": "I", "b": 52 }
        ]
    },
    "mark": "bar",
    "encoding": {
        "x": { "field": "a", "type": "nominal" },
        "y": { "field": "b", "type": "quantitative" },
        "tooltip": { "field": "b", "type": "quantitative" }
    }
}`;

const config = {
    credentials: process.env.credentials,
    dataset_id: "MY_DATASET_ID",
    dataset_url: "MY_DATASET_URL",
    settings: {
        source: {
            type: "dataset",
            spec: {
                name: "Vega Specification JSON",
                id: "f9cad7b01a472135f24aae93db5a5e5a",
            },
        },
    },
};

const xml = "vega.xml";

createApp({
    render: () => h(App, { config: config, xml: xml }),
}).mount("#app");
