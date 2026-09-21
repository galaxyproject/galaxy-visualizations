// A visualization must reach the artifact pane as a frame, and must reach the model as a
// reference only. Both cross the worker boundary, where a dict that is serialized before it is
// claimed loses the artifact without any test below noticing.
const { chromium } = require("playwright");
const OUT = process.env.OUT || "/tmp";
const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = "http://127.0.0.1:8099";

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

const frameSrc = () => {
    const frame = document.querySelector("#artifact-content iframe");
    return frame ? frame.getAttribute("src") : null;
};

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

    await p.goto(APP, { waitUntil: "domcontentloaded" });
    const ready = await waitFor(p, () => /olite ready/i.test(document.body.innerText), 240000);
    check("page loads and the brain reports ready", ready);
    if (!ready) {
        console.log(logs.slice(-25).join("\n"));
        await b.close();
        process.exit(1);
    }

    await fetch(`${STUB}/__script?name=visualization`);
    await fetch(`${STUB}/__forget`);
    await p.fill("#input", "open the structure in a viewer");
    await p.click("#send-btn");

    const framed = await waitFor(p, frameSrc, 90000);
    check("the visualization reaches the artifact pane as a frame", framed);

    const src = await p.evaluate(frameSrc);
    const q = new URLSearchParams((src || "").split("?")[1] || "");
    check(
        "the frame names the plugin, which is what Galaxy renders from",
        (src || "").includes("/visualizations/display") && q.get("visualization") === "ngl"
            && q.get("dataset_id") === "d1",
        src,
    );
    check("showing leaves no saved visualization to address", !q.has("visualization_id"), src);
    check(
        "the frame asks Galaxy for a bare page",
        q.get("hide_panels") === "true" && q.get("hide_masthead") === "true",
    );

    check(
        "the pane is opened for it rather than left collapsed",
        !(await p.evaluate(() => document.body.classList.contains("artifact-collapsed"))),
    );

    check("the title names the visualization", /ngl/i.test(
        await p.evaluate(() => document.querySelector(".artifact-card-title")?.textContent || "")));

    // The payload must not have ridden along to the provider: the second request carries
    // the tool result, and a reference is all the model is owed.
    const { prompts } = await (await fetch(`${STUB}/__seen`)).json();
    const toolResults = prompts.flatMap((q) => q.toolResults || []);
    check("the model was given a tool result at all", toolResults.length > 0);
    check(
        "the frame address is withheld from the model",
        toolResults.length > 0 && toolResults.every((c) => !c.includes("/visualizations/display")),
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
