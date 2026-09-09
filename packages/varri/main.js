import "./main.css";

/**
 * vaRRI Galaxy visualization plugin - entry point.
 *
 * Galaxy injects this module into a blank iframe together with a `#app` div
 * carrying the `data-incoming` attribute: `{root, visualization_config:
 * {dataset_id}}` (see VisualizationFrame.vue in the Galaxy client). Crucially,
 * Galaxy only ever injects a single `<script src=".../index.js">` tag (the
 * plugin's `entry_point`, from varri.xml) into that blank iframe - it never
 * loads this package's `index.html`. So this module is responsible for
 * loading every other asset it needs itself.
 *
 * This plugin does NOT reimplement any part of the vaRRI-js UI. Instead, it
 * embeds the complete, unmodified upstream viewer
 * (https://backofenlab.github.io/vaRRI-js/) - the exact same HTML/JS/CSS
 * shipped in the `varri-js` npm package and vendored, unmodified, by
 * `vite-plugin-static-copy` (see vite.config.js) - in a nested <iframe>, and
 * drives it purely through the URL parameters it already supports for
 * sharing/embedding (see
 * "URL Parameters & Sharing" / "Embedding / Web Integration" in its README).
 * That means: no rendering code, no button/label duplication, and no
 * dependency on vaRRI-js's internal JS API to maintain here - if upstream
 * adds, renames, or removes settings, this plugin keeps working unchanged.
 *
 * The Galaxy dataset is expected to contain either:
 *   - a JSON object of vaRRI-js URL parameters (e.g. `{"sequence": "...",
 *     "structure": "...", "highlighting": "region", ...}`), using upstream's
 *     own parameter names (see its README), forwarded through verbatim; or
 *   - a plain-text query string or full shareable URL, e.g. copied directly
 *     from vaRRI-js's own "🔗 Share Link" export button.
 */

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const datasetId = incoming.visualization_config?.dataset_id;
const root = incoming.root ?? "/";

const messageElement = document.createElement("div");
messageElement.id = "message";
appElement.appendChild(messageElement);

function showError(title, details) {
    messageElement.className = "error";
    messageElement.style.display = "block";
    messageElement.textContent = details ? `${title}: ${details}` : title;
    console.error(title, details ?? "");
}

async function fetchDataset(datasetId) {
    const response = await fetch(`${root}api/datasets/${datasetId}/display`);
    if (!response.ok) {
        throw new Error(`Could not fetch dataset ${datasetId}: HTTP ${response.status}.`);
    }
    return await response.text();
}

/**
 * Turn the dataset's contents into a vaRRI-js URL query string, without
 * interpreting, validating, or renaming any of its parameters - see the
 * module docstring above for the accepted shapes.
 */
function toQueryString(datasetText) {
    let parsed;
    try {
        parsed = JSON.parse(datasetText);
    } catch {
        parsed = datasetText;
    }

    // Plain text: either a full shareable URL or a bare query string.
    if (typeof parsed === "string") {
        const text = parsed.trim();
        const queryIndex = text.indexOf("?");
        return queryIndex === -1 ? text : text.slice(queryIndex + 1);
    }

    // A JSON object of upstream vaRRI-js URL parameter names -> values,
    // forwarded through as-is. Arrays are comma-joined, matching the format
    // vaRRI-js itself uses for list-valued parameters (e.g. `mutations`,
    // `subseqHighlights`, `regionHighlights`).
    if (parsed && typeof parsed === "object") {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(parsed)) {
            if (value === undefined || value === null) {
                continue;
            }
            params.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
        return params.toString();
    }

    throw new Error("Dataset must be a vaRRI-js parameter object, query string, or shareable URL.");
}

async function main() {
    if (!datasetId) {
        showError("No dataset provided.");
        return;
    }

    let datasetText;
    try {
        datasetText = await fetchDataset(datasetId);
    } catch (err) {
        showError(`Could not load dataset ${datasetId}`, err.message);
        return;
    }

    let queryString;
    try {
        queryString = toQueryString(datasetText);
    } catch (err) {
        showError(`Dataset ${datasetId} is not a valid vaRRI-js input`, err.message);
        return;
    }

    const viewerUrl = new URL(/* @vite-ignore */ "vendor/varri-js/index.html", import.meta.url);
    viewerUrl.search = queryString;
    // Galaxy already provides its own page chrome around the visualization
    // iframe, so hide vaRRI-js's own header/footer (its own
    // "hideFooterAndHeader" URL parameter/checkbox - see
    // https://github.com/BackofenLab/vaRRI-js/blob/main/index.js).
    viewerUrl.searchParams.set("hideFooterAndHeader", "1");

    const iframe = document.createElement("iframe");
    iframe.id = "varri-viewer";
    iframe.src = viewerUrl.href;
    iframe.title = "vaRRI-js";
    appElement.appendChild(iframe);
}

main();

