// A browser closed while the model is answering does not lose the turn: the conversation is
// committed in the browser's files, and the reopened page resumes the run and answers once.
// A plain reload can let the old page's worker finish the request itself; closing the browser
// cannot, so the run has to be picked up from what was stored.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const APP = (process.env.APP_URL || "http://localhost:5173/") + "?dataset_id=e2ereload0001";
const STUB = "http://127.0.0.1:8099";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const boot = (page) =>
    page
        .waitForFunction(() => /olit ready/i.test(document.body.innerText), null, { timeout: 120000 })
        .then(() => true)
        .catch(() => false);

const calls = async () => (await (await fetch(`${STUB}/__seen`)).json()).calls;

(async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "olit-reload-"));
    const options = { viewport: { width: 1100, height: 900 } };
    let context = await chromium.launchPersistentContext(profile, options);
    let page = context.pages()[0] || (await context.newPage());
    const logs = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

    await page.goto(APP, { waitUntil: "domcontentloaded" });
    check("the agent boots", await boot(page));
    check("the conversation is kept in the browser's files",
        !/not keeping this conversation/i.test(await page.evaluate(() => document.body.innerText)));

    await fetch(`${STUB}/__script?name=slow-once`);
    await page.fill("#input", "answer slowly");
    await page.click("#send-btn");
    const end = Date.now() + 30000;
    while ((await calls()) < 1 && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    check("the request is in flight when the browser closes", (await calls()) >= 1);
    await context.close();

    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0] || (await context.newPage());
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    check("the agent comes back", await boot(page));
    check("the question is still there", /answer slowly/.test(await page.evaluate(() => document.body.innerText)));

    const answered = await page
        .waitForFunction(() => /The answer after the reload\./.test(document.body.innerText), null, { timeout: 60000 })
        .then(() => true)
        .catch(() => false);
    check("the run resumes and answers", answered);
    const text = await page.evaluate(() => document.body.innerText);
    check("the answer is shown once", (text.match(/The answer after the reload\./g) || []).length === 1);
    check("the abandoned answer never shows", !/the abandoned answer/.test(text));
    check("the model was asked once more, not more", (await calls()) === 2, String(await calls()));
    const back = await page.evaluate(() => !document.querySelector("#send-btn").classList.contains("hidden"));
    check("Send comes back once the run is done", back);

    const failed = results.filter((r) => !r.ok);
    if (failed.length) console.log("\n" + logs.slice(-20).join("\n"));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
    process.exit(failed.length ? 1 : 0);
})();
