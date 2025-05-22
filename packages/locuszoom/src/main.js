import { createApp, h } from "vue";
import App from "./App.vue";
import "./style.css";

async function main() {
    const scriptUrl = new URL(import.meta.url);
    const container = scriptUrl.searchParams.get("container") || "app";
    if (import.meta.env.DEV) {
        // Dynamically import the XML parser utility, used for parsing visualization configurations
        const { parseXML } = await import("galaxy-charts-xml-parser");
        // Construct the incoming data object with mock configuration and data
        const dataIncoming = {
            visualization_config: {
                dataset_id: "b620c45fba703209", // id of primary_dataset.bgzip
                // Placeholder for additional visualization settings
                settings: {
                    tabix: { id: "abd164196b68b912" }, // id of secondary_dataset.tbi
                    chromosome: "1",
                    start: "1",
                    end: "999999",
                },
            },
            // Parse and load the visualization XML configuration
            visualization_plugin: await parseXML("locuszoom.xml"),
        };
        // Find the root app element and attach the mock data as a JSON string to its data-incoming attribute
        const appElement = document.getElementById(container);
        appElement.dataset.incoming = JSON.stringify(dataIncoming);
    }
    createApp({
        render: () => h(App, { container: container, credentials: process.env.credentials }),
    }).mount(`#${container}`);
}
// Start the application
main();
