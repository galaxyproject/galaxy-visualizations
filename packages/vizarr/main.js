import { createViewer } from "vizarr/dist/index";
import axios from "axios";

const appElementId = "#app";
// Access container element
const appElement = document.querySelector(appElementId);

// Attach mock data for development
if (import.meta.env.DEV) {
  // Build the incoming data object
  const dataIncoming = {
    visualization_config: {
      dataset_id: "09f1e31b9542a75b",
    },
    root: "/",
  };

  // Attach config to the data-incoming attribute
  appElement?.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

async function render() {
  const dataset = await getDataset();
  if (!dataset) {
    console.error(`Dataset ${datasetId} not found or failed to load`);
    return;
  }

  const url = getSourceUrl(dataset);
  if (!url) {
    console.error(`Cannot find source URL for dataset ${datasetId}`);
    return;
  }

  const viewer = await createViewer(appElement);
  const config = {
    source: url,
    name: dataset.name,
  };
  viewer.addImage(config);
}

async function getDataset() {
  try {
    const { data: dataset } = await axios.get(
      `${root}api/datasets/${datasetId}`
    );
    return dataset;
  } catch (error) {
    console.error(`Failed to load dataset: ${error.message}`);
  }
}

function getSourceUrl(dataset) {
  if (dataset.state === "deferred") {
    return dataset.sources[0].source_uri;
  }
  return (
    window.location.origin +
    prefixedDownloadUrl(
      root,
      `datasets/${dataset.id}/display/${dataset.metadata_store_root}`
    )
  );
}

const slashCleanup = /(\/)+/g;
function prefixedDownloadUrl(root, path) {
  return `${root}/${path}`.replace(slashCleanup, "/");
}

render();
