// The invariant the ownership rule exists for: an artifact made before a config change is
// still there after it. Switching provider or model applies the new choice by reloading
// (credentials-modal.ts), so the agent and the shell's memory are both replaced and only
// what was persisted comes back. The reload is driven directly here rather than through the
// picker: this tier boots the agent only against the dev server, where a configured provider
// suppresses the picker. provider-switch-drive covers the picker half against the built app.
const { chromium } = require("playwright");
// A history is what the session is keyed on, as Galaxy supplies in production: without one
// nothing is persisted, and nothing can survive the reload this driver is about.
const APP = (process.env.APP_URL || "http://localhost:5173/") + "?dataset_id=d1";
const STUB = "http://127.0.0.1:8099";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const paneFrames = (p) => p.evaluate(() => document.querySelectorAll("#artifact-content iframe").length);
/** The page says so when it is not keeping the conversation, and nothing could survive a reload. */
const durable = (p) => p.evaluate(() => !/not keeping this conversation/i.test(document.body.innerText));

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(APP, { waitUntil: "domcontentloaded" });

    const booted = await page.waitForFunction(
        () => /olit ready/i.test(document.body.innerText), null, { timeout: 120000 })
        .then(() => true).catch(() => false);
    check("the agent boots", booted, booted ? "" : (await page.innerText("body")).slice(0, 200));
    if (!booted) {
        console.log(logs.slice(-20).join("\n"));
        await browser.close();
        process.exit(1);
    }

    // A turn that produces a visualization artifact.
    await fetch(`${STUB}/__script?name=visualization`);
    await fetch(`${STUB}/__forget`);
    await page.fill("#input", "open the structure in a viewer");
    await page.click("#send-btn");
    const made = await page.waitForFunction(
        () => document.querySelectorAll("#artifact-content iframe").length > 0,
        null, { timeout: 90000 }).then(() => true).catch(() => false);
    check("a turn produces an artifact", made, `${await paneFrames(page)} frame(s)`);
    if (!made) {
        await browser.close();
        process.exit(1);
    }

    check("the conversation is kept in the browser's files, not merely in memory", await durable(page));

    // What a config change does: the page reloads, so the agent and every in-memory array
    // in the shell are replaced. Anything that survives survived because it was persisted.
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    const rebooted = await page.waitForFunction(
        () => /olit ready/i.test(document.body.innerText), null, { timeout: 120000 })
        .then(() => true).catch(() => false);
    check("the agent comes back after the reload", rebooted);
    const survived = await page.waitForFunction(
        () => document.querySelectorAll("#artifact-content iframe").length > 0,
        null, { timeout: 30000 }).then(() => true).catch(() => false);
    check("the artifact is still shown after the switch", survived, `${await paneFrames(page)} frame(s)`);

    check("the pane offers its button again, so the artifact is reachable",
        !(await page.evaluate(() => document.querySelector("#artifact-btn").classList.contains("hidden"))));

    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
})();
