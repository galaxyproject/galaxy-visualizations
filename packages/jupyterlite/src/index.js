// Access container element
const appElement = document.querySelector("#app");

// Access attached data
const incoming = JSON.parse(appElement?.dataset.incoming || "{}");
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

// Build query string
const params = { root };
if (datasetId !== undefined) {
    params.dataset_id = datasetId;
}
const query = new URLSearchParams(params).toString();

// Load jupyter
(function () {
    const jupyterRoot = `${root}static/plugins/visualizations/jupyterlite/static/dist/_output/lab`;
    const jupyterTarget = `${jupyterRoot}/index.html?${query}`;
    window.location.replace(jupyterTarget);
})();
