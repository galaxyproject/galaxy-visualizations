// Access container element
const appElement = document.querySelector("#app");

// Access attached data
const incoming = JSON.parse(appElement?.dataset.incoming || "{}");
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

// Build query string
const query = new URLSearchParams({
    dataset_id: datasetId,
    root,
}).toString();

// Load jupyter
(function () {
    const jupyterRoot = `${root}static/plugins/visualizations/jupyterlite/static/dist/_output/lab`;
    const jupyterTarget = `${jupyterRoot}/index.html?${query}`;
    window.location.replace(jupyterTarget);
})();
