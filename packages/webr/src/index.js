import { startR } from "./runtime.js";

const appElement = document.getElementById("app");
appElement.textContent = "Starting R…";

startR().then(async (webR) => {
    appElement.textContent = await webR.evalRString("R.version.string");
});
