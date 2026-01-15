async function create() {
    // Access container element
    const appElement = document.querySelector("#app");

    // Access attached data
    let incoming = {};
    try {
        incoming = JSON.parse(appElement?.dataset.incoming || "{}");
    } catch (e) {
        console.error("[jupyterlite] Failed to parse incoming data:", e);
    }
    const datasetId = incoming.visualization_config?.dataset_id;
    const root = incoming.root || "/";

    // Collect query params
    const params = { root };
    if (datasetId !== undefined) {
        params.dataset_id = datasetId;
        // Identify history from dataset
        try {
            const response = await fetch(`${root}api/datasets/${datasetId}`);
            if (response.ok) {
                const { history_id: historyId } = await response.json();
                params.history_id = historyId;
                console.debug(`[jupyterlite] Identified history from dataset: ${historyId}.`);
            } else {
                console.error("[jupyterlite] Failed to determine current history from dataset.");
            }
        } catch (e) {
            console.error("[jupyterlite] Failed to make fetch request to obtain history from dataset.");
        }
    } else {
        // Identify current history without dataset
        try {
            const response = await fetch(`${root}history/current_history_json`);
            if (response.ok) {
                const { id: historyId } = await response.json();
                params.history_id = historyId;
                console.debug(`[jupyterlite] Identified history: ${historyId}.`);
            } else {
                console.error("[jupyterlite] Failed to determine current history.");
            }
        } catch (e) {
            console.error("[jupyterlite] Failed to make fetch request to obtain history.");
        }
    }

    // Build query string
    const query = new URLSearchParams(params).toString();

    // Load jupyter
    (function () {
        const jupyterRoot = `${root}static/plugins/visualizations/jupyterlite/static/dist/_output/lab`;
        const jupyterTarget = `${jupyterRoot}/index.html?${query}`;
        window.location.replace(jupyterTarget);
    })();
}

create();
