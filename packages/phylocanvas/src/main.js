import { createApp, h } from "vue";
import App from "./App.vue";
import "./style.css";

async function main() {
    if (import.meta.env.DEV) {
        /**
         * Development Environment Setup
         *
         * This section is specifically for configuring the application
         * during development. You can modify the settings below to
         * tailor your development environment, such as simulating data
         * or working with mock services.
         */

        // Dynamically import the XML parser utility, used for parsing visualization configurations
        const { parseXML } = await import("galaxy-charts-xml-parser");

        // Construct the incoming data object with mock configuration and data
        const dataIncoming = {
            visualization_config: {
                // Placeholder for dataset ID
                dataset_id: process.env.dataset_id || "__test__",
                // Placeholder for additional visualization settings
                settings: {},
            },
            // Parse and load the visualization XML configuration
            visualization_plugin: await parseXML("phylocanvas.xml"),
        };

        // Find the root app element and attach the mock data as a JSON string to its data-incoming attribute
        const appElement = document.querySelector("#app");
        appElement.dataset.incoming = JSON.stringify(dataIncoming);
    }

    /**
     * Mount the Vue Application
     *
     * This initializes the Vue app, rendering the root component
     * and passing in any necessary props such as credentials.
     */
    createApp({
        render: () => h(App, { credentials: process.env.credentials }),
    }).mount("#app");
}

// Start the application
main();
