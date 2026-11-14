import { createApp, h } from "vue";
import App from "./App.vue";
import "./style.css";

async function main() {
    const scriptUrl = new URL(import.meta.url);
    const container = scriptUrl.searchParams.get("container") || "app";

    if (import.meta.env.DEV) {
        const { parseXML } = await import("galaxy-charts-xml-parser");
        const pageUrl = new URL(window.location.href);
        const dataIncoming = {
            root: "/",
            visualization_config: {
                dataset_id: pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "__test__",
                settings: JSON.parse(pageUrl.searchParams.get("settings") || "{}"),
            },
            visualization_plugin: await parseXML("webr.xml"),
        };
        document.getElementById(container).dataset.incoming = JSON.stringify(dataIncoming);
    }

    createApp({
        render: () => h(App, { collapse: true, container, credentials: process.env.credentials }),
    }).mount(`#${container}`);
}

main();
