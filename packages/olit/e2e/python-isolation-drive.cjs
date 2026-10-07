// run_python's realm in a built app served from the Galaxy origin, as a deployment serves it.
// Both sides of its boundary: Python keeps CORS-bounded network access, and loses the Galaxy
// session, the model key and the agent's state. Pyodide's own files come from a static path
// without CORS headers, as Galaxy's do, so the realm booting at all proves they reach it.
// BROWSER=firefox or webkit runs it there: they attach Galaxy's cookie where Chromium does not.
const playwright = require("playwright");
const BROWSER = process.env.BROWSER || "chromium";
const OUT = process.env.OUT || "/tmp";
const STUB = "http://127.0.0.1:8099";
const APP = process.env.APP_URL || `${STUB}/plugins/visualizations/olit?dataset_id=d1`;
const KEY = "sk-e2e-canary";

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

const seen = async () => (await fetch(`${STUB}/__seen`)).json();

(async () => {
    const b = await playwright[BROWSER].launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

    await fetch(`${STUB}/__script?name=python-isolation`);
    await p.goto(APP, { waitUntil: "domcontentloaded" });
    await waitFor(p, () => !!document.querySelector("#cred-provider"), 20000);
    await p.selectOption("#cred-provider", "openrouter");
    await p.fill("#cred-endpoint", `${STUB}/v1`);
    await p.fill("#cred-key", KEY);
    await p.fill("#cred-model", "stub-model");
    await p.click("#cred-save");

    const ready = await waitFor(p, () => /olit ready|resumed this history/i.test(document.body.innerText), 300000);
    check("the agent is up", ready);
    if (!ready) {
        console.log(logs.slice(-20).join("\n"));
        await b.close();
        process.exit(1);
    }

    // A marker in the agent's own worker, which Python must not be able to see.
    const agent = p.workers().find((w) => !w.url().startsWith("data:"));
    check("the agent's worker is reachable to mark", !!agent, p.workers().map((w) => w.url()).join(" | "));
    if (agent) await agent.evaluate(() => (self.__olitCanary = true));

    await fetch(`${STUB}/__forget`);
    await p.fill("#input", "probe the python realm");
    await p.click("#send-btn");
    await waitFor(p, () => !document.querySelector("#send-btn").classList.contains("hidden"), 300000);

    const { prompts, cookies } = await seen();
    const output = prompts.flatMap((q) => q.toolResults || []).find((t) => t.includes("probe:")) || "";
    let probe = {};
    try {
        probe = JSON.parse(output.slice(output.indexOf("probe:") + 6).replace(/^'|'$/g, ""));
    } catch {
        // Reported by the checks below.
    }
    check("run_python ran in the realm", Object.keys(probe).length > 0, (output || logs.slice(-5).join(" | ")).slice(0, 300));

    // ---- what Python keeps ------------------------------------------------------
    check("a cross-origin pyfetch to a CORS-enabled endpoint still works", probe.cors === 200, String(probe.cors));

    // ---- what Python loses ------------------------------------------------------
    check("Python runs in an opaque origin", probe.origin === "null", probe.origin);
    const fromPython = cookies.filter((c) => c.url.includes("from=python"));
    const toGalaxy = fromPython.filter((c) => c.url.includes("/api/"));
    check("Python's requests reached Galaxy", toGalaxy.length >= 3, JSON.stringify(fromPython));
    check(
        "none of them carried the Galaxy session, credentialed or not",
        fromPython.length > 0 && fromPython.every((c) => c.cookie === null),
        JSON.stringify(fromPython),
    );
    check(
        "Python reads Galaxy as an anonymous visitor at most",
        !String(probe["same-origin"]).includes("e2e-user") && !String(probe.include).includes("e2e-user"),
        `${probe["same-origin"]} / ${probe.include}`,
    );
    // The control: the cookie is real, and the agent's own Galaxy requests do carry it.
    check(
        "the agent's own Galaxy requests carry the session",
        cookies.some((c) => !c.url.includes("from=python") && /galaxysession=e2e-session/.test(c.cookie || "")),
    );
    check("Python has no storage of the page's origin", probe.storage === "blocked", probe.storage);
    check("Python cannot see the agent's worker", probe.canary === false, String(probe.canary));
    check(
        "the model key reaches the provider from the agent, and nowhere Python can read",
        prompts.some((q) => q.authorization === `Bearer ${KEY}`) && probe.key === false,
        String(probe.key),
    );

    await p.screenshot({ path: `${OUT}/i1-python-isolation.png` });
    const failed = results.filter((r) => !r.ok);
    if (failed.length) console.log("\n" + logs.slice(-20).join("\n"));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await b.close();
    process.exit(failed.length ? 1 : 0);
})();
