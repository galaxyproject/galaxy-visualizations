/**
 * vaRRI Galaxy visualization plugin - entry point.
 *
 * Galaxy injects this module into a blank iframe (see VisualizationFrame.vue
 * in the Galaxy client) together with a `#app` div carrying the
 * `data-incoming` attribute: `{root, visualization_config: {dataset_id},
 * visualization_plugin}`.
 *
 * This script only bridges Galaxy and the upstream vaRRI-js GUI:
 *
 *   1. fetch the dataset JSON from the Galaxy API,
 *   2. map it to vaRRI URL parameters (the same format the upstream
 *      `examples.js` uses and that the upstream GUI understands),
 *   3. load the unmodified upstream `index.html` GUI in rendering-only mode.
 *
 * All styles and scripts come from the upstream repository (fetched by
 * `scripts/fetch_upstream.mjs`); nothing of the visualization itself is
 * maintained here.
 */

const incoming = JSON.parse(document.getElementById("app").dataset.incoming);
const root = incoming.root;
const datasetId = incoming.visualization_config.dataset_id;

function showError(message) {
    const box = document.createElement("div");
    box.style.cssText = `
        font-family: sans-serif;
        max-width: 700px;
        margin: 3rem auto;
        padding: 1rem 1.25rem;
        border: 1px solid #f5c6cb;
        border-radius: 6px;
        background: #f8d7da;
        color: #721c24;
        white-space: pre-wrap;
    `;
    box.textContent = `vaRRI visualization error\n\n${message}`;
    document.body.appendChild(box);
}

async function main() {
    let response;
    try {
        response = await fetch(`${root}api/datasets/${datasetId}/display`);
    } catch (err) {
        showError(`Could not reach the Galaxy API: ${err.message}`);
        return;
    }
    if (!response.ok) {
        showError(`Could not fetch dataset ${datasetId}: HTTP ${response.status}.`);
        return;
    }

    let vaRRIParams;
    try {
        const parsed = JSON.parse(await response.text());
        vaRRIParams = parsed && typeof parsed.vaRRIParams === "object" ? parsed.vaRRIParams : parsed;
    } catch (err) {
        showError(`Dataset ${datasetId} is not valid vaRRI JSON: ${err.message}`);
        return;
    }
    if (typeof vaRRIParams !== "object" || vaRRIParams === null) {
        showError(`Dataset ${datasetId} does not contain a vaRRI parameter object.`);
        return;
    }
    if (!vaRRIParams.sequence || !vaRRIParams.structure) {
        showError(`Dataset ${datasetId} must define both "sequence" and "structure".`);
        return;
    }

    const query = new URLSearchParams();
    query.set("showRenderingOnly", "false");
    for (const [key, value] of Object.entries(vaRRIParams)) {
        if (value !== undefined && value !== null && value !== "") {
            query.set(key, String(value));
        }
    }
    // The upstream GUI expects '(' and ')' to be percent-encoded explicitly
    // (RFC 3986 does not encode them; URLSearchParams leaves them raw).
    const queryString = query.toString().replace(/\(/g, "%28").replace(/\)/g, "%29");

    // Directory of this script == the plugin's static dir (upstream GUI lives there).
    const pluginDir = new URL(import.meta.url).pathname.replace(/\/[^/]*$/, "");
    window.location.replace(`${pluginDir}/index.html?${queryString}`);
}

main();
