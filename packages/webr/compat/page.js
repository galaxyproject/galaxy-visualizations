import { startR } from "../src/runtime.js";

const appElement = document.getElementById("app");
appElement.textContent = "Starting R…";

window.webrReady = startR().then(async (webR) => {
    window.webR = webR;
    appElement.textContent = await webR.evalRString("R.version.string");
});
