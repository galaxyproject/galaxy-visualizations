// The refuse path: with no Galaxy tool catalog, approving a plan must be refused *before*
// the turn is sent. loom's init gate short-circuits before any LLM call; this asserts the
// same property the same way the live driver asserts the approval gate -- by counting calls
// on the far side, not by trusting the UI.
//
// The stub serves no OpenAPI document, so this tier is already the unavailable state.
const { chromium } = require("playwright");

const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = process.env.STUB_URL || "http://127.0.0.1:8099";

let failed = 0;
const check = (name, ok, detail) => {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const calls = async () => (await (await fetch(`${STUB}/__seen`)).json()).calls;

async function waitFor(page, fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await page.evaluate(fn)) return true;
        await page.waitForTimeout(400);
    }
    return false;
}

(async () => {
    await fetch(`${STUB}/__script?name=plan`);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

    await page.goto(APP, { waitUntil: "domcontentloaded" });
    check("booted", await waitFor(page, () => /olit ready/i.test(document.body.innerText), 240000));

    await page.fill("#input", "Draft a plan to concatenate my two datasets.");
    await page.click("#send-btn");
    const carded = await waitFor(page, () => !!document.querySelector(".plan-draft-approve"), 120000);
    check("plan draft card offered", carded);
    if (!carded) {
        console.log(logs.slice(-8).join("\n"));
        await browser.close();
        process.exit(1);
    }

    // The catalog never loaded, so the guard should fire on this click.
    const before = await calls();
    await page.click(".plan-draft-approve");
    await page.waitForTimeout(2500);
    const after = await calls();

    const body = await page.evaluate(() => document.body.innerText);
    check("approval was refused in the UI", /Galaxy is not available/i.test(body),
          /Galaxy is not available/i.test(body) ? "notice shown" : "no refusal notice");
    // The point of the whole driver: refused *before* the turn was sent, not after.
    check("no turn was sent", after === before, `${before} -> ${after} provider calls`);
    check("the plan card survives the refusal", !!(await page.locator(".plan-draft-approve").count()));

    console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
    await browser.close();
    process.exit(failed ? 1 : 0);
})();
