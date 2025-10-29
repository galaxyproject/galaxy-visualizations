const appElement = document.getElementById("app");
if (!appElement) {
    throw new Error("#app container not found");
}

const incoming = JSON.parse(appElement.dataset.incoming || "{}");
const root = incoming.root || "";
const scriptSrc = `${root}static/plugins/visualizations/hyphyvision/static/script.js`;

const styleLink = document.createElement("link");
styleLink.rel = "stylesheet";
styleLink.href = "https://use.fontawesome.com/releases/v5.6.3/css/all.css";

const shimLink = document.createElement("link");
shimLink.rel = "stylesheet";
shimLink.href = "https://use.fontawesome.com/releases/v5.6.3/css/v4-shims.css";

const script = document.createElement("script");
script.src = scriptSrc;

appElement.append(styleLink, shimLink, script);
