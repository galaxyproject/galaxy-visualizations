const appElement = document.getElementById("app");
if (!appElement) {
    throw new Error("#app container not found");
}

const incoming = JSON.parse(appElement.dataset.incoming || "{}");
const root = incoming.root || "/";

const script = document.createElement("script");
script.src = `${root}static/plugins/visualizations/hyphyvision/static/script.js`;

appElement.append(script);
