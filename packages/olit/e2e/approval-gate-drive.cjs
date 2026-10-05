// The refuse path, and the paths that must not refuse.
//
// With Galaxy unreachable, approving a plan must be refused *before* the turn is sent. loom's
// init gate short-circuits before any LLM call; this asserts the same property the same way the
// live driver asserts the approval gate -- by counting calls on the far side, not by trusting
// the UI.
//
// The catalog takes no part in that decision: it gates lineage_report, organize_datasets and
// charting, and no Galaxy tool reads it. So a plan is approved both when nothing has asked for
// the catalog and after the catalog has been asked for and failed.
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

    // An ordinary session: Galaxy answers and nothing has failed.
    const beforeAllowed = await calls();
    await page.click(".plan-draft-approve");
    await page.waitForTimeout(2500);
    const afterAllowed = await calls();
    const allowedBody = await page.evaluate(() => document.body.innerText);
    check("an ordinary session does not refuse the plan",
          !/Galaxy is not available/i.test(allowedBody),
          /Galaxy is not available/i.test(allowedBody) ? "refused an ordinary session" : "approval proceeded");
    check("the approved turn was sent", afterAllowed > beforeAllowed,
          `${beforeAllowed} -> ${afterAllowed} provider calls`);

    // Now run a process, which fails here: the stub serves none of what it reads.
    // The approved turn above answered with another plan card, so count from what is on screen.
    await fetch(`${STUB}/__script?name=plan-after-process`);
    const cards = await page.locator(".plan-draft-approve").count();
    await page.fill("#input", "Organize the seed history, then plan the rest.");
    await page.click("#send-btn");
    const recarded = await waitFor(
        page, (n) => document.querySelectorAll(".plan-draft-approve").length > n, 180000, cards);
    check("plan draft card offered after a process", recarded);
    if (!recarded) {
        console.log(logs.slice(-8).join("\n"));
        await browser.close();
        process.exit(1);
    }

    const before = await calls();
    await page.locator(".plan-draft-approve").last().click();
    await page.waitForTimeout(2500);
    const after = await calls();

    const failedBody = await page.evaluate(() => document.body.innerText);
    check("a failed process does not refuse the plan",
          !/nothing in this plan can run/i.test(failedBody),
          /nothing in this plan can run/i.test(failedBody) ? "refused after the process" : "approval proceeded");
    check("the approved turn was sent", after > before, `${before} -> ${after} provider calls`);

    // Now the state the gate is actually for: Galaxy itself does not answer. The agent probes
    // once per session, so this needs a fresh load.
    await fetch(`${STUB}/__galaxy?up=0`);
    await fetch(`${STUB}/__script?name=plan`);
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    check("booted against an unreachable Galaxy",
          await waitFor(page, () => /olit ready/i.test(document.body.innerText), 240000));
    await page.fill("#input", "Draft a plan to concatenate my two datasets.");
    await page.click("#send-btn");
    const downCarded = await waitFor(page, () => !!document.querySelector(".plan-draft-approve"), 120000);
    check("plan draft card offered with Galaxy down", downCarded);
    if (!downCarded) {
        console.log(logs.slice(-8).join("\n"));
        await fetch(`${STUB}/__galaxy?up=1`);
        await browser.close();
        process.exit(1);
    }

    const beforeDown = await calls();
    await page.locator(".plan-draft-approve").last().click();
    await page.waitForTimeout(2500);
    const afterDown = await calls();

    const body = await page.evaluate(() => document.body.innerText);
    check("approval was refused in the UI", /Galaxy did not answer/i.test(body),
          /Galaxy did not answer/i.test(body) ? "notice shown" : "no refusal notice");
    // The point of the whole driver: refused *before* the turn was sent, not after.
    check("no turn was sent", afterDown === beforeDown, `${beforeDown} -> ${afterDown} provider calls`);
    check("the plan card survives the refusal", !!(await page.locator(".plan-draft-approve").count()));
    await fetch(`${STUB}/__galaxy?up=1`);

    console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
    await browser.close();
    process.exit(failed ? 1 : 0);
})();
