// Drives the built bundle the way a deployment serves it: the stub renders Galaxy's
// host page, so data-incoming, the plugin href and the Pyodide path are production's.
const { chromium } = require("playwright");
const OUT = process.env.OUT || "/tmp";
const STUB = "http://127.0.0.1:8099";
const APP = process.env.APP_URL || `${STUB}/plugins/visualizations/olite?dataset_id=d1&history_id=h1`;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
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

const credOpen = () => {
    const el = document.querySelector("#cred-overlay");
    return !!el && !el.classList.contains("hidden");
};
const isReady = () => /olite ready|resumed this history/i.test(document.body.innerText);
const modalOpen = () => {
    const el = document.querySelector("#ext-overlay");
    return !!el && !el.classList.contains("hidden");
};

async function connect(page) {
    await page.selectOption("#cred-provider", "ollama");
    await page.fill("#cred-endpoint", `${STUB}/v1`);
    await page.fill("#cred-model", "stub-model");
    await page.click("#cred-save");
}

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
    // A 404 under the plugin href is the deployment-path failure this tier exists to catch.
    const missing = [];
    p.on("response", (r) => {
        if (r.status() >= 400 && r.url().includes("/static/plugins/visualizations/")) missing.push(`${r.status()} ${r.url()}`);
    });

    await fetch(`${STUB}/__script?name=confirm`);
    await p.goto(APP, { waitUntil: "domcontentloaded" });

    check("a built app asks for a provider before booting", await waitFor(p, credOpen, 20000));
    await connect(p);

    const ready = await waitFor(p, isReady, 300000);
    check("the brain boots from the Galaxy deployment path", ready);
    check("nothing under the plugin href 404s", missing.length === 0, missing.join(" | "));
    await p.screenshot({ path: `${OUT}/g1-ready.png` });
    if (!ready) {
        console.log(logs.slice(-30).join("\n"));
        await b.close();
        process.exit(1);
    }

    const context = logs.find((l) => l.includes("[olite] context"));
    check("Galaxy calls resolve against the deployment root", !!context && context.includes(`${STUB}/`), context);

    // ---- the seed prompt comes from data-incoming, not the built-in fallback ----
    await fetch(`${STUB}/__forget`);
    await p.fill("#input", "delete my history");
    await p.click("#send-btn");
    const asked = await waitFor(p, modalOpen, 120000);
    check("a destructive op still gates in a built app", asked);

    const { prompts } = await (await fetch(`${STUB}/__seen`)).json();
    const system = prompts[0] && prompts[0].text;
    check(
        "the system prompt is the one the plugin XML ships",
        !!system && /co-scientist that orchestrates/.test(system),
        (system || "").slice(0, 80),
    );

    if (asked) {
        await p.click("#ext-accept");
        const end = Date.now() + 60000;
        let puts = [];
        while (Date.now() < end) {
            const { seen } = await (await fetch(`${STUB}/__seen`)).json();
            puts = seen.filter((s) => s.startsWith("PUT"));
            if (puts.length) break;
            await p.waitForTimeout(300);
        }
        check("approving reaches Galaxy at the deployment root", puts.length === 1, JSON.stringify(puts));
    }
    await waitFor(p, () => !document.querySelector("#send-btn").classList.contains("hidden"), 120000);
    await p.screenshot({ path: `${OUT}/g2-approved.png` });

    // ---- the history from data-incoming keys the session ----------------------
    await p.reload({ waitUntil: "domcontentloaded" });
    const resumed = await waitFor(p, () => /resumed this history/i.test(document.body.innerText), 300000);
    check("the history in data-incoming restores the conversation", resumed);
    check("the restored turns come back with it", /delete my history/i.test(await p.evaluate(() => document.body.innerText)));
    await p.screenshot({ path: `${OUT}/g3-resumed.png` });

    const failed = results.filter((r) => !r.ok);
    if (failed.length) console.log("\n" + logs.slice(-20).join("\n"));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await b.close();
    process.exit(failed.length ? 1 : 0);
})();
