// One tab holds a conversation at a time. A second tab says the conversation is open elsewhere,
// takes it over when asked, and keeps it in the browser's files; the first tab says it lost it.
const { chromium } = require("playwright");
const APP = (process.env.APP_URL || "http://localhost:5173/") + "?dataset_id=e2etabs0001";
const STUB = "http://127.0.0.1:8099";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const shows = (page, pattern, ms = 120000) =>
    page
        .waitForFunction((p) => new RegExp(p, "i").test(document.body.innerText), pattern.source, { timeout: ms })
        .then(() => true)
        .catch(() => false);

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const first = await context.newPage();
    await first.goto(APP, { waitUntil: "domcontentloaded" });
    check("the first tab boots", await shows(first, /olit ready/));

    await fetch(`${STUB}/__script?name=compact`);
    await first.fill("#input", "remember this");
    await first.click("#send-btn");
    await first.waitForFunction(() => !document.querySelector("#send-btn").classList.contains("hidden"), null, {
        timeout: 60000,
    });

    const second = await context.newPage();
    await second.goto(APP, { waitUntil: "domcontentloaded" });
    check("the second tab says the conversation is open elsewhere", await shows(second, /open in another tab/));

    await second.click("text=Use it here");
    check("it takes the conversation over", await shows(second, /olit ready/));
    check("with the conversation it took", /remember this/.test(await second.evaluate(() => document.body.innerText)));
    check("kept in the browser's files, not in memory",
        !/not keeping this conversation/i.test(await second.evaluate(() => document.body.innerText)));
    check("the first tab says it lost the conversation", await shows(first, /another tab, which has it now/, 30000));
    check("and takes no more input", await first.evaluate(() => document.querySelector("#input").disabled));

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
