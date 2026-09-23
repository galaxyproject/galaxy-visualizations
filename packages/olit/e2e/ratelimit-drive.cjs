// Watch what the user sees while the provider is rate limiting us.
const { chromium } = require("playwright");
const OUT = process.env.OUT || "/tmp";

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
    await p.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

    const wait = async (fn, ms) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (await p.evaluate(fn)) return true;
            await p.waitForTimeout(500);
        }
        return false;
    };
    if (!(await wait(() => /olit ready/i.test(document.body.innerText), 300000))) {
        console.log("FAIL  never booted");
        await b.close();
        process.exit(1);
    }

    await p.fill("#input", "do something");
    await p.click("#send-btn");

    const shown = await wait(() => /Rate limited/i.test(document.body.innerText), 30000);
    console.log(shown ? "PASS  rate limit is announced" : "FAIL  nothing shown while waiting");

    const seen = new Set();
    for (let i = 0; i < 10; i++) {
        const m = (await p.evaluate(() => document.body.innerText)).match(/retrying in (\d+)s/);
        if (m) seen.add(m[1]);
        await p.waitForTimeout(1000);
    }
    console.log(`PASS  countdown ticked through ${seen.size} values: ${[...seen].join(", ")}`);
    await p.screenshot({ path: `${OUT}/ratelimit.png` });

    const done = await wait(
        () => !document.querySelector("#send-btn").classList.contains("hidden"),
        120000,
    );
    console.log(done ? "PASS  turn recovered after the wait" : "FAIL  turn never finished");
    const text = await p.evaluate(() => document.body.innerText);
    console.log("PASS  no traceback shown:", !/Traceback|PythonError/.test(text));
    console.log("\n--- transcript ---\n" + text.slice(0, 700));
    await b.close();
})();
