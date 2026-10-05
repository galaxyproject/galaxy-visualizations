// run_python in real Pyodide, in its isolated realm: top-level await, and a cross-origin fetch
// the browser actually performs. python-isolation-drive proves what the realm cannot reach.
const { chromium } = require("playwright");
const OUT = process.env.OUT || "/tmp";
const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = "http://127.0.0.1:8099";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function waitFor(page, fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await page.evaluate(fn)) return true;
        await page.waitForTimeout(500);
    }
    return false;
}

const toolResults = async () =>
    (await (await fetch(`${STUB}/__seen`)).json()).prompts.flatMap((p) => p.toolResults || []);

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

    await p.goto(APP, { waitUntil: "domcontentloaded" });
    const ready = await waitFor(p, () => /olit ready/i.test(document.body.innerText), 240000);
    check("the agent is up", ready);
    if (!ready) {
        console.log(logs.slice(-20).join("\n"));
        await b.close();
        process.exit(1);
    }

    await fetch(`${STUB}/__script?name=python`);
    await fetch(`${STUB}/__forget`);
    await p.fill("#input", "run some python");
    await p.click("#send-btn");
    await waitFor(p, () => !document.querySelector("#send-btn").classList.contains("hidden"), 180000);

    const outputs = await toolResults();
    const answer = outputs.find((t) => t.includes("awaited:") || t.includes("Traceback") || t.includes("Error"));
    check("run_python produced a result", !!answer, (answer || outputs.join(" | ")).slice(0, 200));

    // 200 proves the browser performed the request; 'calls' proves the body came back.
    check("top-level await and a cross-origin pyfetch both work",
        !!answer && answer.includes("awaited:200:True"), (answer || "").slice(0, 200));

    await p.screenshot({ path: `${OUT}/p1-python.png` });

    // ---- Stop ends Python that never returns, and the next run starts afresh ----
    await fetch(`${STUB}/__script?name=python-forever`);
    await p.fill("#input", "loop forever");
    await p.click("#send-btn");
    await p.waitForTimeout(5000);
    await p.click("#abort-btn");
    const stopped = await waitFor(p, () => !document.querySelector("#send-btn").classList.contains("hidden"), 30000);
    check("Stop ends a Python run that never returns", stopped);

    await fetch(`${STUB}/__script?name=python`);
    await fetch(`${STUB}/__forget`);
    await p.fill("#input", "run some python again");
    await p.click("#send-btn");
    await waitFor(p, () => !document.querySelector("#send-btn").classList.contains("hidden"), 180000);
    const again = (await toolResults()).find((t) => t.includes("awaited:"));
    check("Python runs again after the stop", !!again && again.includes("awaited:200:True"), (again || "").slice(0, 200));
    const failed = results.filter((r) => !r.ok);
    if (failed.length) console.log("\n" + logs.slice(-20).join("\n"));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await b.close();
    process.exit(failed.length ? 1 : 0);
})();
