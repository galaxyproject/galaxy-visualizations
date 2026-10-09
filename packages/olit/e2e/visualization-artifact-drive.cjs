// A visualization must reach the artifact pane mounted from its whole config, as Galaxy's
// VisualizationFrame mounts a plugin, and must reach the model as a reference only. Both cross the worker boundary, where a dict that is serialized before it is
// claimed loses the artifact without any test below noticing.
const { chromium } = require("playwright");
const { eventually } = require("./eventually.cjs");
const OUT = process.env.OUT || "/tmp";
const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = "http://127.0.0.1:8099";
// Galaxy as the page reaches it: its own root in dev, which proxies Galaxy's paths to the stub.
const GALAXY = new URL("/", APP).href;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function waitFor(page, fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await page.evaluate(fn)) return true;
        await page.waitForTimeout(500);
    }
    return false;
}

/** What the plugin in the pane's frame was handed and shows, once it has run. */
const mounted = () => {
    const doc = document.querySelector("#artifact-content iframe")?.contentDocument;
    const app = doc?.getElementById("app");
    if (!app || !/ngl mounted/.test(app.textContent)) return null;
    return { incoming: JSON.parse(app.dataset.incoming), src: doc.querySelector("script")?.getAttribute("src") };
};

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

    await p.goto(APP, { waitUntil: "domcontentloaded" });
    const ready = await waitFor(p, () => /olit ready/i.test(document.body.innerText), 240000);
    check("page loads and the agent reports ready", ready);
    if (!ready) {
        console.log(logs.slice(-25).join("\n"));
        await b.close();
        process.exit(1);
    }

    await fetch(`${STUB}/__script?name=visualization`);
    await fetch(`${STUB}/__forget`);
    await p.fill("#input", "open the structure in a viewer");
    await p.click("#send-btn");

    const framed = await waitFor(p, mounted, 90000);
    check("the plugin runs in the artifact pane", framed);

    const { incoming, src } = (await p.evaluate(mounted)) || { incoming: {} };
    check(
        "it is mounted from the entry point the plugin declares",
        src === `${GALAXY}static/plugins/visualizations/ngl/static/dist/viewer.js`,
        src,
    );
    check(
        "it is handed the whole config, settings included",
        JSON.stringify(incoming.visualization_config) === JSON.stringify({ dataset_id: "d1", settings: { mode: "cartoon" } }),
        JSON.stringify(incoming.visualization_config),
    );
    check("showing leaves no saved visualization to address", !incoming.visualization_id);
    check("it is rooted at Galaxy", incoming.root === GALAXY, incoming.root);

    check(
        "the pane is opened for it rather than left collapsed",
        !(await p.evaluate(() => document.body.classList.contains("artifact-collapsed"))),
    );

    check("the title names the visualization", /ngl/i.test(
        await p.evaluate(() => document.querySelector(".artifact-card-title")?.textContent || "")));

    // The payload must not have ridden along to the provider: the second request carries
    // the tool result, and a reference is all the model is owed.
    const toolResults = await eventually(
        async () => {
            const { prompts } = await (await fetch(`${STUB}/__seen`)).json();
            const results = prompts.flatMap((q) => q.toolResults || []);
            return results.length ? results : undefined;
        },
        { what: "a request carrying the tool result" },
    ).catch((error) => (console.log(error.message), []));
    check("the model was given a tool result at all", toolResults.length > 0);
    check(
        "the config is withheld from the model",
        toolResults.length > 0 && toolResults.every((c) => !c.includes("cartoon")),
        toolResults[0]?.slice(0, 160),
    );
    check(
        "the model is told an artifact exists",
        toolResults.some((c) => c.includes('"kind": "visualization"') || c.includes('"kind":"visualization"')),
    );

    await p.screenshot({ path: `${OUT}/viz-artifact.png` });

    console.log("\n" + logs.filter((l) => /error|Error|artifact|visuali/i.test(l)).slice(-12).join("\n"));
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await b.close();
    process.exit(failed.length ? 1 : 0);
})();
