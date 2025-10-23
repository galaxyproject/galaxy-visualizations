const appElement = document.querySelector("#app")
const incoming = JSON.parse(appElement.dataset.incoming || "{}")

const PLUGIN_PATH = "plugins/visualizations/mvpapp";
__webpack_public_path__ = `${incoming.root}static/${PLUGIN_PATH}/static/`;
