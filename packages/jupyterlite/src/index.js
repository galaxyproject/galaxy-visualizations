// Access container element
const appElement = document.querySelector("#app");

// Access attached data
const incoming = JSON.parse(appElement?.dataset.incoming || "{}");
const datasetId = incoming.visualization_config.dataset_id;
const datasetUrl = incoming.visualization_config.dataset_url;
const root = incoming.root;

// Build query string
const query = new URLSearchParams({
    dataset_id: datasetId,
    dataset_url: datasetUrl || `${root}api/datasets/${datasetId}/display`,
    root,
}).toString();

// Load jupyter
(function () {
    const jupyterRoot = `${root}static/plugins/visualizations/jupyterlite/static/dist/_output/lab`;
    const jupyterTarget = `${jupyterRoot}/index.html?${query}`;
    window.location.replace(jupyterTarget);
})();
