var $ = require('jquery');
window.$ = $;
window.jQuery = $;

// Import Drawrna core
var Drawrna = require("./drawrna"); // <-- the file you posted

// Attach everything once DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    var appElement = document.getElementById("app");
    if (!appElement) {
        console.error("No #app element found.");
        return;
    }

    var targetElement = document.createElement("div");
    targetElement.id = "target";
    appElement.appendChild(targetElement);

    // Create and render RNA viewer
    var viewer = new Drawrna({
        el: targetElement,
        seq: "GGGAAACCC",
        dotbr: "(((...)))",
        layout: "naview",
        seqpanel: false,
        optspanel: false
    });

    viewer.render();
});
