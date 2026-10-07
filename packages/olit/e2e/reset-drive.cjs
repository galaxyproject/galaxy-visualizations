// Reset leaves the old conversation behind with Galaxy work still running. That work may finish
// and update the old conversation's record, but it must not start a model request nobody sees.
const playwright = require("playwright");
const BROWSER = process.env.BROWSER || "chromium";
const STUB = "http://127.0.0.1:8099";
const LAUNCH = `${STUB}/plugins/visualizations/olit?dataset_id=dreset&frame=1`;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const get = async (path) => (await fetch(`${STUB}${path}`)).json();
const record = async () => (await get("/__pages")).pages.find((p) => p.history_id === "h-dreset");
const shown = (frame, pattern, ms = 120000) =>
    frame.locator(`text=${pattern}`).first().waitFor({ timeout: ms }).then(() => true, () => false);

(async () => {
    await fetch(`${STUB}/__job?state=queued`);
    await fetch(`${STUB}/__script?name=reset-watch`);
    const browser = await playwright[BROWSER].launch();
    const page = await (await browser.newContext()).newPage();
    await page.goto(LAUNCH, { waitUntil: "domcontentloaded" });
    const frame = page.frameLocator("#galaxy_visualization");
    await frame.locator("#cred-provider").waitFor({ timeout: 30000 });
    await frame.locator("#cred-provider").selectOption("openrouter");
    await frame.locator("#cred-endpoint").fill(`${STUB}/v1`);
    await frame.locator("#cred-key").fill("sk-or-v1-stubkeystubkey");
    await frame.locator("#cred-model").fill("stub-model");
    await frame.locator("#cred-save").click();
    check("boots", await shown(frame, "/olit ready/i"));

    await frame.locator("#input").fill("run cat on it");
    await frame.locator("#send-btn").click();
    check("the tool run is submitted", await shown(frame, "Submitted.", 60000));
    check("the record notes the job as submitted", /jreset1`? — submitted/.test((await record())?.content || ""));

    await frame.locator("#reset-btn").click();
    check("Reset starts a new conversation", await shown(frame, "Started a new conversation", 30000));
    const before = (await get("/__seen")).calls;

    await fetch(`${STUB}/__job?state=ok`);
    let finished = false;
    for (let i = 0; i < 40 && !finished; i++) {
        await page.waitForTimeout(1000);
        finished = /finished \(ok\)/.test((await record())?.content || "");
    }
    check("the old conversation's record shows the job finished", finished);
    // Past the watch's next poll, so a follow-up would have been sent by now.
    await page.waitForTimeout(3000);
    const after = (await get("/__seen")).calls;
    check("no model request follows the work it left behind", after === before, `${before} -> ${after}`);
    check("nothing on screen claims a follow-up", !/Checking the Galaxy results/.test(await frame.locator("body").innerText()));

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
