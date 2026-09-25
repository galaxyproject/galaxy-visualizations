// A reopened session showed the chart it started with instead of the one it ended on. The
// live path clears the pane each turn and renders what that turn produced; the restore path
// rendered every stored artifact in order, so the oldest sat on top. Unit tests cover the
// choice of artifact; only this tier runs both paths against the same stored document.
const { chromium } = require("playwright");
// Keyed on a history the way Galaxy supplies one: without it nothing persists and there is
// nothing to restore.
const APP = (process.env.APP_URL || "http://localhost:5173/") + "?history_id=h1";
const STUB = "http://127.0.0.1:8099";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const cardTitles = (p) =>
    p.evaluate(() =>
        [...document.querySelectorAll("#artifact-content .artifact-card-title")].map((e) => e.textContent),
    );

/** Artifacts inside the stored session document, so the check is about content not keys. */
const storedArtifacts = (p) =>
    p.evaluate(async () => {
        const open = indexedDB.open("olit", 1);
        const db = await new Promise((r) => (open.onsuccess = () => r(open.result)));
        const names = [...db.objectStoreNames];
        if (!names.length) return [];
        const store = db.transaction(names[0], "readonly").objectStore(names[0]);
        const read = (q) => new Promise((r) => (q.onsuccess = () => r(q.result || [])));
        const keys = (await read(store.getAllKeys())).map(String);
        const values = await read(store.getAll());
        const docs = keys.map((k, i) => ({ k, v: values[i] })).filter((e) => e.k.startsWith("session:"));
        return docs.flatMap((d) => (d.v?.artifacts || []).map((a) => a.title));
    });

const boot = (page) =>
    page
        .waitForFunction(() => /olit ready/i.test(document.body.innerText), null, { timeout: 120000 })
        .then(() => true)
        .catch(() => false);

const titled = (page, title) =>
    page
        .waitForFunction(
            (t) =>
                [...document.querySelectorAll("#artifact-content .artifact-card-title")].some(
                    (e) => e.textContent === t,
                ),
            title,
            { timeout: 90000 },
        )
        .then(() => true)
        .catch(() => false);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const logs = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(APP, { waitUntil: "domcontentloaded" });

    const booted = await boot(page);
    check("the brain boots", booted, booted ? "" : (await page.innerText("body")).slice(0, 200));
    if (!booted) {
        console.log(logs.slice(-20).join("\n"));
        await browser.close();
        process.exit(1);
    }

    await fetch(`${STUB}/__script?name=two-artifacts`);
    await fetch(`${STUB}/__forget`);

    await page.fill("#input", "chart the first thing");
    await page.click("#send-btn");
    const first = await titled(page, "First Chart");
    check("the first turn produces its artifact", first, (await cardTitles(page)).join(", "));

    await page.fill("#input", "now chart the second thing");
    await page.click("#send-btn");
    const second = await titled(page, "Second Chart");
    check("the second turn produces its artifact", second, (await cardTitles(page)).join(", "));
    if (!first || !second) {
        console.log(logs.slice(-20).join("\n"));
        await browser.close();
        process.exit(1);
    }

    // The live contract: a turn replaces the pane rather than appending to it.
    check("a live turn shows only what it just produced",
        (await cardTitles(page)).join(",") === "Second Chart", (await cardTitles(page)).join(", "));

    const kept = await storedArtifacts(page);
    check("both artifacts are persisted, so restore has a choice to get wrong",
        kept.length === 2 && kept[0] === "First Chart" && kept[1] === "Second Chart",
        kept.join(", ") || "(none)");

    // Reopening the saved session: the brain and every in-memory array are replaced, so the
    // pane is filled from the stored document alone.
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    check("the brain comes back after the reload", await boot(page));

    const restored = await titled(page, "Second Chart");
    const titles = await cardTitles(page);
    check("a reopened session shows the newest artifact", restored, titles.join(", ") || "(none)");
    check("and shows it alone, not the whole history stacked oldest-first",
        titles.length === 1 && titles[0] === "Second Chart", titles.join(", ") || "(none)");

    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
})();
