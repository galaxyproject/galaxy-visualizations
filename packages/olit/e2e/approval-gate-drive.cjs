// The refuse path, and the paths that must not refuse.
//
// With Galaxy unreachable, Olit does not start, so nothing reaches the model; this is asserted
// by counting calls on the far side, not by trusting the UI.
//
// The catalog takes no part in that decision: it gates lineage_report, organize_datasets and
// charting, and no Galaxy tool reads it. So a plan is approved both when nothing has asked for
// the catalog and after the catalog has been asked for and failed.
const { chromium } = require("playwright");
const { eventually } = require("./eventually.cjs");

const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = process.env.STUB_URL || "http://127.0.0.1:8099";

let failed = 0;
const check = (name, ok, detail) => {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const calls = async () => (await (await fetch(`${STUB}/__seen`)).json()).calls;

/** Until the approval is answered: a turn reaches the provider, or the page says it refused. */
const answered = (page, before, refusal) =>
    eventually(
        async () => (await calls()) > before || refusal.test(await page.evaluate(() => document.body.innerText)),
        { what: "the approval to be answered" },
    ).catch(() => {});

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
    await answered(page, beforeAllowed, /Galaxy is not available/i);
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
    await answered(page, before, /nothing in this plan can run/i);
    const after = await calls();

    const failedBody = await page.evaluate(() => document.body.innerText);
    check("a failed process does not refuse the plan",
          !/nothing in this plan can run/i.test(failedBody),
          /nothing in this plan can run/i.test(failedBody) ? "refused after the process" : "approval proceeded");
    check("the approved turn was sent", after > before, `${before} -> ${after} provider calls`);

    // Galaxy itself does not answer, from a fresh load.
    await fetch(`${STUB}/__galaxy?up=0`);
    await fetch(`${STUB}/__script?name=plan`);
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    const beforeDown = await calls();
    check("an unreachable Galaxy stops Olit with an error",
          await waitFor(page, () => /Olit\s+works in a history, so it cannot start/i.test(document.body.innerText), 120000));
    check("the input is disabled", await page.locator("#input").isDisabled());
    check("no turn was sent", (await calls()) === beforeDown);
    await fetch(`${STUB}/__galaxy?up=1`);

    console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
    await browser.close();
    process.exit(failed ? 1 : 0);
})();
