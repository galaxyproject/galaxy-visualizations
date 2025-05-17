// igv_entrypoint.js
import igv from "igv";
import { getGenomeReference, createTrackConfig, determineTrackType } from "./util.js";
import { GalaxyGenomeMapper } from "./GalaxyGenomeMapper.js";
import { GalaxyTrackBuilder } from "./GalaxyTrackBuilder.js";
import { IGVErrorHandler } from "./IGVErrorHandler.js";

if (!igv) {
    console.error("IGV not loaded", igv);
}

let igvBrowser = null;

function showError(container, error) {
    IGVErrorHandler.displayError(container, error);
}

function createLoadingIndicator(container) {
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "igv-loading";
    loadingDiv.style.cssText = `
        background: #d1ecf1;
        color: #0c5460;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 10px;
        text-align: center;
        font-weight: bold;
    `;
    loadingDiv.textContent = "Loading IGV Browser...";
    container.appendChild(loadingDiv);
    return loadingDiv;
}

document.addEventListener("DOMContentLoaded", async () => {
    const vizContainerElement = document.getElementById("app");
    if (!vizContainerElement) {
        console.error("Incoming data element with id 'app' not found.");
        return;
    }

    let incomingData;
    try {
        incomingData = JSON.parse(vizContainerElement.dataset.incoming);
    } catch (error) {
        const parseError = new Error("Failed to parse visualization configuration");
        parseError.originalError = error;
        showError(vizContainerElement, parseError);
        console.error("Failed to parse incoming data:", error);
        return;
    }

    const { visualization_config, visualization_plugin, root } = incomingData;

    const igvContainer = Object.assign(document.createElement("div"), {
        id: "igv-container",
        style: "width: 100%; height: 600px; border: 2px solid #25537b; border-radius: 1rem; padding: 1rem; box-sizing: border-box;",
    });

    const controlsContainer = Object.assign(document.createElement("div"), {
        id: "igv-controls",
        style: "width: 100%; margin-bottom: 10px; padding: 5px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;",
    });

    // Add height control
    const heightControl = document.createElement("div");
    heightControl.innerHTML = `
        <label for="igv-height">Viewer Height: </label>
        <input type="range" id="igv-height" min="300" max="1200" value="600" step="50">
        <span id="height-value">600px</span>
    `;
    controlsContainer.appendChild(heightControl);

    // Event listener for height adjustment
    const heightInput = heightControl.querySelector("#igv-height");
    const heightValue = heightControl.querySelector("#height-value");
    heightInput.addEventListener("input", (e) => {
        const newHeight = e.target.value + "px";
        heightValue.textContent = newHeight;
        igvContainer.style.height = newHeight;
    });

    // Add to the page
    vizContainerElement.appendChild(controlsContainer);
    vizContainerElement.appendChild(igvContainer);

    // Add loading indicator
    const loadingDiv = createLoadingIndicator(igvContainer);

    const datasetId = visualization_config.dataset_id;
    const genomeRegion = visualization_config.genome_region || "chr1:1-1000000"; // Default locus if not specified
    let dbkey = visualization_config.dbkey;

    const trackColor = visualization_config.track_color || "#1f77b4";
    const trackDisplayMode = visualization_config.track_display_mode || "EXPANDED";
    const trackHeight = parseInt(visualization_config.track_height || "100", 10);

    let datasetDetails = {};
    try {
        const response = await fetch(`/api/datasets/${datasetId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch dataset: ${response.statusText}`);
        }
        datasetDetails = await response.json();

        // If dbkey wasn't provided in visualization_config, use the one from the dataset
        if (!dbkey) {
            dbkey = datasetDetails.metadata_dbkey;
        }

        // Final check for dbkey
        if (!dbkey) {
            console.warn("No dbkey found in visualization_config or dataset metadata, using default");
            dbkey = "hg38"; // Default to hg38 if no dbkey is available
        }
    } catch (error) {
        loadingDiv.remove();
        showError(igvContainer, `Failed to load dataset details: ${error.message}`);
        console.error("Error fetching dataset details:", error);
        return;
    }

    const datatype = datasetDetails.file_ext;

    // Use the determineTrackType function to get the appropriate track configuration
    const { trackType, datasetFormat, requiresIndex } = determineTrackType(datatype);

    // Set index URL if the track type requires it (only BAM files need it)
    const indexUrl = requiresIndex && datatype === "bam" ? `/datasets/${datasetId}/index` : undefined;

    // Construct the dataset URL
    const datasetUrl = `/datasets/${datasetId}/display`;

    let genomeReference;
    try {
        genomeReference = await GalaxyGenomeMapper.getIGVGenome(dbkey);
        console.log("Using genome reference:", genomeReference);
    } catch (error) {
        console.error("Error getting genome reference:", error);
        IGVErrorHandler.logError("genome-loading", error);
        // Fallback to using dbkey directly or a default genome
        genomeReference = dbkey || "hg38";
        console.warn("Using fallback genome reference:", genomeReference);
    }

    let trackConfig;
    try {
        trackConfig = await GalaxyTrackBuilder.buildTrack(datasetDetails, {
            height: trackHeight,
            displayMode: trackDisplayMode,
            color: trackColor,
        });
    } catch (error) {
        console.error("Error building track configuration:", error);
        // Fallback to manual configuration
        trackConfig = {
            name: datasetDetails.name || "Dataset",
            type: trackType,
            format: datasetFormat,
            url: datasetUrl,
            color: trackColor,
            height: trackHeight,
            visibilityWindow: 1000000,
            displayMode: trackDisplayMode,
            // Enable byte-range requests
            supportsPartialRequest: true,
        };
    }

    // Only add indexURL if it exists
    if (indexUrl) {
        trackConfig.indexURL = indexUrl;
    }

    // Customize based on track type
    if (trackType === "alignment") {
        trackConfig.alignmentRowHeight = 10;
        trackConfig.sort = {
            position: "base",
            direction: "ASC",
        };
        trackConfig.colorBy = "strand";
        if (datatype === "bam" && indexUrl) {
            trackConfig.indexURL = indexUrl;
            trackConfig.indexFormat = "bai";
        } else if (datatype === "cram" && indexUrl) {
            trackConfig.indexURL = indexUrl;
            trackConfig.indexFormat = "crai";
        }
    } else if (trackType === "variant" && indexUrl) {
        trackConfig.indexURL = indexUrl;
        trackConfig.indexFormat = "tbi";
    }

    // Initialize IGV
    try {
        const browserConfig = {
            genome: genomeReference,
            locus: genomeRegion,
            tracks: [trackConfig],
            loadDefaultGenomes: true,
            enableHttpRangeRequests: true,
            showNavigation: true,
            showRuler: true,
            showCenterGuide: true,
            showCursorTrackingGuide: true,
        };

        // Validate the browser config before creating
        if (!browserConfig.genome) {
            throw new Error("No genome specified for IGV browser");
        }

        igvBrowser = await igv.createBrowser(igvContainer, browserConfig);

        // Remove loading indicator
        loadingDiv.remove();

        // Set up drag and drop events for the IGV container
        const trackDefaults = {
            color: trackColor,
            height: trackHeight,
            displayMode: trackDisplayMode,
        };
        setupDragAndDrop(igvContainer, dbkey, genomeReference, trackDefaults);

        console.log("IGV Browser initialized successfully with Galaxy integration");

        // Add display mode control

        // Add a track visibility toggle
        const visibilityToggle = document.createElement("select");
        visibilityToggle.innerHTML = `
            <option value="EXPANDED" ${trackDisplayMode === "EXPANDED" ? "selected" : ""}>Expanded</option>
            <option value="COLLAPSED" ${trackDisplayMode === "COLLAPSED" ? "selected" : ""}>Collapsed</option>
            <option value="SQUISHED" ${trackDisplayMode === "SQUISHED" ? "selected" : ""}>Squished</option>
        `;
        visibilityToggle.addEventListener("change", () => {
            const track = igvBrowser.trackViews[0].track;
            track.displayMode = visibilityToggle.value;
            igvBrowser.trackViews[0].updateViews();
        });

        const visibilityContainer = document.createElement("div");
        visibilityContainer.appendChild(document.createTextNode("Display: "));
        visibilityContainer.appendChild(visibilityToggle);

        controlsContainer.appendChild(visibilityContainer);

        // Set container position for absolute positioning
        igvContainer.style.position = "relative";
    } catch (error) {
        loadingDiv.remove();
        IGVErrorHandler.displayError(igvContainer, error);
        IGVErrorHandler.logError("browser-creation", error);
        console.error("Error creating IGV Browser:", error);
    }
});

/**
 * Sets up drag and drop functionality for the IGV browser
 * @param {HTMLElement} container - The IGV container element
 * @param {string} dbkey - The genome database key
 * @param {object|string} genomeReference - The genome reference object or string
 * @param {object} trackDefaults - Default track configuration from visualization settings
 */
function setupDragAndDrop(container, dbkey, genomeReference, trackDefaults = {}) {
    // Create drop indicator
    const dropIndicator = document.createElement("div");
    dropIndicator.id = "igv-drop-indicator";
    dropIndicator.innerText = "Drop dataset here to add as a track";
    dropIndicator.style.display = "none";
    dropIndicator.style.position = "absolute";
    dropIndicator.style.top = "0";
    dropIndicator.style.left = "0";
    dropIndicator.style.width = "100%";
    dropIndicator.style.height = "100%";
    dropIndicator.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    dropIndicator.style.color = "white";
    dropIndicator.style.fontSize = "24px";
    dropIndicator.style.textAlign = "center";
    dropIndicator.style.justifyContent = "center";
    dropIndicator.style.alignItems = "center";
    dropIndicator.style.zIndex = "1000";
    dropIndicator.style.borderRadius = "1rem";
    container.appendChild(dropIndicator);

    // Add event listeners for drag and drop
    container.addEventListener("dragenter", function (e) {
        e.preventDefault();
        // Check if the dragged item is from Galaxy history panel
        const dataTransfer = e.dataTransfer;

        // Always show the drop indicator for any drag operation
        dropIndicator.style.display = "flex";
    });

    container.addEventListener("dragover", function (e) {
        e.preventDefault();
    });

    container.addEventListener("dragleave", function (e) {
        e.preventDefault();
        // Hide the drop indicator if the drag leaves the container
        if (e.target === container) {
            dropIndicator.style.display = "none";
        }
    });

    container.addEventListener("drop", async function (e) {
        e.preventDefault();
        dropIndicator.style.display = "none";

        try {
            // Simple direct approach - just get the text/plain data
            const dataTransfer = e.dataTransfer;

            // Get the plain text data
            let plainText = "";
            try {
                plainText = dataTransfer.getData("text/plain");
            } catch (error) {
                console.error("Error getting text/plain data:", error);
                return;
            }

            if (!plainText) {
                return;
            }

            // Parse the data
            let historyItemData = null;
            try {
                const parsedData = JSON.parse(plainText);

                // Galaxy sends an array of dataset objects
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    historyItemData = parsedData[0]; // Use the first item
                } else if (parsedData && parsedData.id) {
                    historyItemData = parsedData; // It's a single item
                } else {
                    return;
                }
            } catch (error) {
                console.error("Error parsing drop data as JSON:", error);
                return;
            }

            // Verify we have a valid dataset
            if (!historyItemData || !historyItemData.id) {
                return;
            }

            // Verify that we have a valid dataset
            if (!historyItemData.id) {
                return;
            }

            if (historyItemData.history_content_type && historyItemData.history_content_type !== "dataset") {
                // History content type check - continue anyway as some drag types may not include history_content_type
                // Continue anyway as some drag types may not include history_content_type
            }

            // Show loading indicator for the new track
            const loadingDiv = document.createElement("div");
            loadingDiv.innerHTML = "Loading track...";
            loadingDiv.style.padding = "20px";
            loadingDiv.style.textAlign = "center";
            loadingDiv.style.fontWeight = "bold";
            loadingDiv.style.position = "absolute";
            loadingDiv.style.bottom = "0";
            loadingDiv.style.right = "0";
            loadingDiv.style.backgroundColor = "white";
            loadingDiv.style.border = "1px solid #ddd";
            loadingDiv.style.borderRadius = "4px";
            loadingDiv.style.zIndex = "1000";
            container.appendChild(loadingDiv);

            // Extract dataset information

            // Fetch dataset details to get the format and other metadata
            const datasetId = historyItemData.id;
            const response = await fetch(`/api/datasets/${datasetId}`);
            if (!response.ok) {
                throw new Error(`API responded with status: ${response.status}`);
            }
            const datasetDetails = await response.json();

            // Use the dataset's dbkey if available, otherwise use current genome
            const trackDbkey =
                datasetDetails.metadata_dbkey || datasetDetails.genome_build || historyItemData.genome_build || dbkey;

            // Determine track type and format based on file extension
            const datatype = datasetDetails.file_ext || historyItemData.extension || historyItemData.file_ext;

            // Use GalaxyTrackBuilder for dropped tracks
            const trackConfig = await GalaxyTrackBuilder.buildTrack(datasetDetails, {
                height: trackDefaults.height,
                displayMode: trackDefaults.displayMode,
                color: trackDefaults.color,
            });

            // Override some properties for dropped tracks
            trackConfig.autoHeight = true;
            if (trackDefaults.height && trackDefaults.height !== 100) {
                trackConfig.height = trackDefaults.height;
                trackConfig.autoHeight = false;
            }

            // Load the track into the IGV browser

            if (!igvBrowser) {
                throw new Error("IGV browser object is not available");
            }

            await igvBrowser.loadTrack(trackConfig);

            // Remove loading indicator
            loadingDiv.remove();
        } catch (error) {
            console.error("Error processing dropped dataset:", error);

            // Remove loading indicator if it exists
            if (loadingDiv && loadingDiv.parentNode) {
                loadingDiv.remove();
            }
        }
    });
}
