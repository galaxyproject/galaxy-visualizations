// Switching provider after boot must not require clearing browser storage by hand,
// and must not discard the conversation (session memory lives in IndexedDB).
const { chromium } = require("playwright");
const offline = require("./offline.cjs");
const APP = process.env.APP_URL || "http://127.0.0.1:8099/plugins/visualizations/olite";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await offline(page);
    await page.goto(APP);

    await page.waitForSelector("#cred-overlay:not(.hidden)", { timeout: 20000 });
    await page.selectOption("#cred-provider", "openrouter");
    await page.fill("#cred-key", "k1");
    await page.click("#cred-save");
    // The overlay is removed inside the save handler, a tick before main.ts labels
    // the button — so wait for the label, not for the overlay to vanish.
    await page.waitForFunction(
        () => (document.querySelector("#model-btn")?.textContent || "").includes("·"),
        null, { timeout: 10000 });

    const label = await page.textContent("#model-btn");
    check("button names the active provider and model", /openrouter/.test(label), label);

    await page.click("#model-btn");
    await page.waitForSelector("#cred-overlay:not(.hidden)", { timeout: 10000 });
    check("picker reopens without clearing storage", true);
    check("previous provider is preselected",
        (await page.inputValue("#cred-provider")) === "openrouter");

    await page.selectOption("#cred-provider", "deepseek");
    await page.fill("#cred-key", "k2");
    await page.click("#cred-save");
    await page.waitForSelector("#model-btn", { timeout: 20000 });
    await page.waitForFunction(
        () => (document.querySelector("#model-btn")?.textContent || "").includes("deepseek"),
        null, { timeout: 20000 });

    check("switch took effect after reload", true, await page.textContent("#model-btn"));
    const stored = await page.evaluate(() => sessionStorage.getItem("olite.credentials"));
    check("stored credentials replaced", stored.includes("deepseek") && !stored.includes("k1"), stored);
    check("overlay does not reappear once switched",
        await page.evaluate(() => {
            const el = document.querySelector("#cred-overlay");
            return !el || el.classList.contains("hidden");
        }));

    // Dismissal: only meaningful once a working selection exists to fall back on.
    const labelBefore = await page.textContent("#model-btn");

    await page.click("#model-btn");
    await page.waitForSelector("#cred-overlay:not(.hidden)", { timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#cred-overlay"), null, { timeout: 5000 });
    check("Escape dismisses the switch picker", true);
    check("Escape leaves the active model untouched",
        (await page.textContent("#model-btn")) === labelBefore, await page.textContent("#model-btn"));

    await page.click("#model-btn");
    await page.waitForSelector("#cred-overlay:not(.hidden)", { timeout: 10000 });
    const box = await page.locator("#cred-overlay").boundingBox();
    await page.mouse.click(box.x + 8, box.y + 8);   // backdrop, outside the dialog
    await page.waitForFunction(() => !document.querySelector("#cred-overlay"), null, { timeout: 5000 });
    check("backdrop click dismisses the switch picker", true);
    check("credentials survive dismissal",
        (await page.evaluate(() => sessionStorage.getItem("olite.credentials"))).includes("deepseek"));

    // First run must NOT be dismissible: there is nothing to fall back to.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.waitForSelector("#cred-overlay:not(.hidden)", { timeout: 20000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    check("first-run picker ignores Escape",
        await page.evaluate(() => {
            const el = document.querySelector("#cred-overlay");
            return !!el && !el.classList.contains("hidden");
        }));

    await browser.close();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})();
