import "./style.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { App, H5GroveProvider } from "@h5web/app";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: "0c1da521da72c0b0",
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const { root, visualization_config } = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = visualization_config.dataset_id;
const datasetName = visualization_config.dataset_name || "Input";

function MyApp(props) {
  return (
    <H5GroveProvider
      url={props.url}
      filepath={props.name}
      axiosConfig={{ params: { file: props.name } }}
    >
      <App />
    </H5GroveProvider>
  );
}

const url = window.location.origin + root + "api/datasets/" + datasetId + "/content";

const rootElement = createRoot(appElement);

rootElement.render(
    <MyApp
        url={url}
        name={datasetName}
    />
);
