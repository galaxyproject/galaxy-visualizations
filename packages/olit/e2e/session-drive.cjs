// A reload must not lose the conversation: pi resumes from session.jsonl, olit from IndexedDB.
const { chromium } = require("playwright");
const OUT = process.env.OUT || "/tmp";
const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = process.env.STUB_URL || "http://127.0.0.1:8099";
const HISTORY = "e2ehistory0001";
const URL = `${APP}?history_id=${HISTORY}`;

let failed = 0;
function check(name, ok, detail) {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

(async () => {
    const browser = await chromium.launch();
    // One context for both visits, so IndexedDB survives the reload as it would for a user.
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    const page = await context.newPage();

    const wait = async (fn, ms) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (await page.evaluate(fn)) return true;
            await page.waitForTimeout(500);
        }
        return false;
    };
    const booted = () => wait(() => /olit ready|Resumed this history/i.test(document.body.innerText), 60000);
    const idle = () => wait(() => !document.querySelector("#send-btn").classList.contains("hidden"), 60000);

    // The default scenario answers with a destructive call and opens the gate; this one just replies.
    await fetch(`${STUB}/__script?name=compact`);

    await page.goto(URL, { waitUntil: "domcontentloaded" });
    if (!(await booted())) {
        check("booted", false, "never became ready");
        await browser.close();
        process.exit(1);
    }

    const ASK = "list my histories please";
    await page.fill("#input", ASK);
    await page.click("#send-btn");
    check("turn completed", await idle(), "send button came back");

    const before = await page.evaluate(() => document.body.innerText);
    check("the turn is on screen", before.includes(ASK));

    // The reload is the whole point: a new document, a new worker, a new brain.
    await page.reload({ waitUntil: "domcontentloaded" });
    check("resumed after reload", await booted());

    const after = await page.evaluate(() => document.body.innerText);
    check("the conversation came back", after.includes(ASK), "user message replayed");
    check("the resume is announced", /Resumed this history/i.test(after));
    check("no traceback", !/Traceback|PythonError/.test(after));
    await page.screenshot({ path: `${OUT}/session-resumed.png` });

    // Reset clears both the panel and the store, so the next load starts clean.
    await page.click("#reset-btn");
    await page.waitForTimeout(500);
    const reset = await page.evaluate(() => document.body.innerText);
    check("reset clears the panel", !reset.includes(ASK));
    check("reset says the record is safe", /record on Galaxy is untouched/i.test(reset));

    await page.reload({ waitUntil: "domcontentloaded" });
    check("booted after reset", await booted());
    const fresh = await page.evaluate(() => document.body.innerText);
    check("reset survives a reload", !fresh.includes(ASK), "nothing restored");

    // A different history is a different conversation, as a different cwd is for pi.
    await page.goto(`${APP}?history_id=otherhistory`, { waitUntil: "domcontentloaded" });
    check("booted on another history", await booted());
    const other = await page.evaluate(() => document.body.innerText);
    check("histories are kept apart", !other.includes(ASK));

    console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
    await browser.close();
    process.exit(failed ? 1 : 0);
})();
