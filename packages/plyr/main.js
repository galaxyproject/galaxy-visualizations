import axios from "axios";
import "./main.css";
import Plyr from "plyr";
import "plyr/dist/plyr.css";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

/* Build the data request url. Modify the API route if necessary. */
const dataUrl = `${root}api/datasets/${datasetId}/display`;
const metaUrl = `${root}api/datasets/${datasetId}`;

/* Build and attach message element */
const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

async function create() {
    showMessage("Loading...");
    const dataset = await getData(metaUrl);
    if (["mp3", "mp4", "ogg"].includes(dataset.extension)) {
        // Detect media type
        const mediaType = ["mp3", "ogg"].includes(dataset.extension) ? "audio" : "video";

        // Create player element
        const playerElement = document.createElement(mediaType);
        playerElement.controls = true;
        playerElement.addEventListener("error", (event) => {
            const mediaError = event.currentTarget?.error;
            if (mediaError) {
                switch (mediaError.code) {
                    case mediaError.MEDIA_ERR_ABORTED:
                        showMessage("Media playback was aborted.");
                        break;
                    case mediaError.MEDIA_ERR_NETWORK:
                        showMessage("A network error caused the media download to fail.");
                        break;
                    case mediaError.MEDIA_ERR_DECODE:
                        showMessage(
                            "The media playback was aborted due to a corruption problem or unsupported features.",
                        );
                        break;
                    case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        showMessage("The media could not be loaded because the format is not supported.");
                        break;
                    default:
                        showMessage("An unknown media error occurred.");
                        break;
                }
            }
        });

        // Attach and load player
        appElement.appendChild(playerElement);
        new Plyr(playerElement).source = {
            type: mediaType,
            sources: [
                {
                    src: dataUrl,
                    type: `${mediaType}/${dataset.extension}`,
                },
            ],
        };
        hideMessage();
    } else {
        showMessage(`Invalid dataset extension: ${dataset.extension}.`);
    }
}

async function getData(url) {
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (e) {
        showMessage("Failed to retrieve data.", e);
    }
}

function showMessage(title, details = null) {
    details = details ? `: ${details}` : "";
    messageElement.innerHTML = `<strong>${title}${details}</strong>`;
    messageElement.style.display = "inline";
    console.debug(`${title}${details}`);
}

function hideMessage() {
    messageElement.style.display = "none";
}

create();
