// The refuse path, and the path that must not refuse.
//
// With the tool catalog asked for and unavailable, approving a plan must be refused *before*
// the turn is sent. loom's init gate short-circuits before any LLM call; this asserts the same
// property the same way the live driver asserts the approval gate -- by counting calls on the
// far side, not by trusting the UI.
//
// The catalog loads on first use, and only the graph route uses it, so a session that has not
// taken that route has a catalog that is not loaded and not broken either. Approving then has
// to proceed: reading "not asked" as "failed" refused every plan in every ordinary session.
// The stub serves no OpenAPI document, so taking the graph route is what makes it unavailable.
const { chromium } = require("playwright");

const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = process.env.STUB_URL || "http://127.0.0.1:8099";

let failed = 0;
const check = (name, ok, detail) => {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const calls = async () => (await (await fetch(`${STUB}/__seen`)).json()).calls;

async function waitFor(page, fn, ms, arg) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await page.evaluate(fn, arg)) return true;
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

    // Nothing has needed the catalog, which is not the same as it having failed.
    const beforeAllowed = await calls();
    await page.click(".plan-draft-approve");
    await page.waitForTimeout(2500);
    const afterAllowed = await calls();
    const allowedBody = await page.evaluate(() => document.body.innerText);
    check("a catalog nothing asked for does not refuse the plan",
          !/Galaxy is not available/i.test(allowedBody),
          /Galaxy is not available/i.test(allowedBody) ? "refused an ordinary session" : "approval proceeded");
    check("the approved turn was sent", afterAllowed > beforeAllowed,
          `${beforeAllowed} -> ${afterAllowed} provider calls`);

    // Now take the graph route, which is what loads the catalog -- and it cannot load here.
    // The approved turn above answered with another plan card, so count from what is on screen.
    await fetch(`${STUB}/__script?name=plan-after-graph`);
    const cards = await page.locator(".plan-draft-approve").count();
    await page.fill("#input", "Chart the seed dataset, then plan the rest.");
    await page.click("#send-btn");
    const recarded = await waitFor(
        page, (n) => document.querySelectorAll(".plan-draft-approve").length > n, 180000, cards);
    check("plan draft card offered after the graph route", recarded);
    if (!recarded) {
        console.log(logs.slice(-8).join("\n"));
        await browser.close();
        process.exit(1);
    }

    const before = await calls();
    await page.locator(".plan-draft-approve").last().click();
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
