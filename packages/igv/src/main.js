import axios from "axios";
import igv from "igv";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
            dataset_content: {
                genome: "hg38",
                locus: "chr8:127,736,588-127,739,371",
                tracks: [
                    {
                        name: "HG00103",
                        url: "https://s3.amazonaws.com/1000genomes/data/HG00103/alignment/HG00103.alt_bwamem_GRCh38DH.20150718.GBR.low_coverage.cram",
                        indexURL:
                            "https://s3.amazonaws.com/1000genomes/data/HG00103/alignment/HG00103.alt_bwamem_GRCh38DH.20150718.GBR.low_coverage.cram.crai",
                        format: "cram",
                    },
                ],
            },
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const root = incoming.root;
const visualizationConfig = incoming.visualization_config || {};

function datasetsGetUrl(root, datasetId) {
    return `${root}api/datasets/${datasetId}/display`;
}

async function render() {
    let datasetContent = "";
    if (visualizationConfig.dataset_id) {
        const datasetUrl = datasetsGetUrl(root, visualizationConfig.dataset_id);
        const { data } = await axios.get(datasetUrl);
        datasetContent = data;
    } else {
        datasetContent = visualizationConfig.dataset_content;
    }
    igv.createBrowser(appElement, datasetContent)
        .then(() => {
            console.debug("Created IGV browser.");
        })
        .catch((e) => {
            console.error("Failed to create IGV browser", e);
        });
}

render();
