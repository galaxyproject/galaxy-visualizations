import { createApp, h } from "vue";
import App from "./App.vue";
import "./style.css";

async function main() {
    /**
     * Identify the target container
     */
    const scriptUrl = new URL(import.meta.url);
    const container = scriptUrl.searchParams.get("container") || "app";

    /**
     * Development Environment Setup
     *
     * This section is specifically for configuring the application
     * during development. You can modify the settings below to
     * tailor your development environment, such as simulating data
     * or working with mock services.
     */
    if (import.meta.env.DEV) {
        // Dynamically import the XML parser utility, used for parsing visualization configurations
        const { parseXML } = await import("galaxy-charts-xml-parser");

        // Construct the incoming data object with mock configuration and data
        const dataIncoming = {
            visualization_config: {
                // Placeholder for dataset URL (can be replaced during actual development)
                // dataset_url: "https://niivue.github.io/niivue-demo-images/mni152.nii.gz",
                // Placeholder for dataset ID
                dataset_id: process.env.dataset_id || "__test__",
                // Placeholder for additional visualization settings
                settings: {},
            },
            // Parse and load the visualization XML configuration
            visualization_plugin: await parseXML("niivue.xml"),
        };

        // Find the root app element and attach the mock data as a JSON string to its data-incoming attribute
        const appElement = document.getElementById(container);
        appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
    }

    /**
     * Mount the Vue Application
     *
     * This initializes the Vue app, rendering the root component
     * and passing in any necessary props such as credentials.
     */
    createApp({
        render: () => h(App, { container: container, credentials: process.env.credentials }),
    }).mount(`#${container}`);
}

// Start the application
main();
