// Watch what the user sees while the provider is rate limiting us.
const { chromium } = require("playwright");
const OUT = process.env.OUT || "/tmp";
const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = process.env.STUB_URL || "http://127.0.0.1:8099";

let failed = 0;
function check(name, ok, detail) {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

(async () => {
    // The stub answers the first call with a 429 only under this scenario.
    await fetch(`${STUB}/__script?name=ratelimit`);
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
    await p.goto(APP, { waitUntil: "domcontentloaded" });

    const wait = async (fn, ms) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (await p.evaluate(fn)) return true;
            await p.waitForTimeout(500);
        }
        return false;
    };
    if (!(await wait(() => /olit ready/i.test(document.body.innerText), 300000))) {
        check("booted", false);
        await b.close();
        process.exit(1);
    }

    await p.fill("#input", "do something");
    await p.click("#send-btn");

    check("the rate limit is announced",
          await wait(() => /Rate limited/i.test(document.body.innerText), 30000));

    const seen = new Set();
    for (let i = 0; i < 10; i++) {
        const m = (await p.evaluate(() => document.body.innerText)).match(/retrying in (\d+)s/);
        if (m) seen.add(m[1]);
        await p.waitForTimeout(1000);
    }
    check("the countdown ticks down", seen.size > 1, [...seen].join(", "));
    await p.screenshot({ path: `${OUT}/ratelimit.png` });

    const done = await wait(
        () => !document.querySelector("#send-btn").classList.contains("hidden"),
        120000,
    );
    check("the turn recovers after the wait", done);
    const text = await p.evaluate(() => document.body.innerText);
    check("the retry reaches the model", /recovered after the wait/.test(text));
    check("no traceback", !/Traceback|PythonError/.test(text));

    console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
    await b.close();
    process.exit(failed ? 1 : 0);
})();
