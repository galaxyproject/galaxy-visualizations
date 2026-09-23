// Drives the provider/key overlay on the real page. No stub needed: the picker
// resolves before the worker boots, which is the point of the ordering.
const { chromium } = require("playwright");
const offline = require("./offline.cjs");
const APP = process.env.APP_URL || "http://127.0.0.1:8099/plugins/visualizations/olite";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const credOpen = () => {
    const el = document.querySelector("#cred-overlay");
    return !!el && !el.classList.contains("hidden");
};
// Page-evaluated separately: helpers defined here are not in the page scope.
const credClosed = () => {
    const el = document.querySelector("#cred-overlay");
    return !el || el.classList.contains("hidden");
};

async function waitFor(page, fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await page.evaluate(fn)) return true;
        await page.waitForTimeout(250);
    }
    return false;
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await offline(page);
    await page.goto(APP);

    check("overlay appears when no key is stored", await waitFor(page, credOpen, 15000));

    const providers = await page.evaluate(() =>
        [...document.querySelectorAll("#cred-provider option")].map((o) => o.value),
    );
    check("registry drives the provider list", providers.includes("openrouter") && providers.includes("galaxy"),
        providers.join(","));

    // A provider whose endpoint takes no key must not show a key box.
    await page.selectOption("#cred-provider", "galaxy");
    const galaxyKeyHidden = await page.evaluate(() =>
        document.querySelector("#cred-key-field").classList.contains("hidden"));
    check("key field hidden for the Galaxy proxy", galaxyKeyHidden);

    await page.selectOption("#cred-provider", "openrouter");
    const keyShown = await page.evaluate(() =>
        !document.querySelector("#cred-key-field").classList.contains("hidden"));
    check("key field shown for a keyed provider", keyShown);

    // Empty key must be refused and the overlay must stay up.
    await page.click("#cred-save");
    const err = await page.evaluate(() => document.querySelector("#cred-error").textContent);
    check("empty key is refused", !!err && (await page.evaluate(credOpen)), err);

    await page.fill("#cred-key", "test-key-123");
    await page.click("#cred-save");
    check("overlay closes once a key is supplied", await waitFor(page, credClosed, 5000));

    const stored = await page.evaluate(() => sessionStorage.getItem("olite.credentials"));
    check("credentials land in sessionStorage", !!stored && stored.includes("openrouter"), stored);

    // The key must never be written into the Galaxy-persisted plugin specs.
    const inSpecs = await page.evaluate(() => document.documentElement.outerHTML.includes("test-key-123"));
    check("key is not written into the page/specs markup", !inSpecs);

    await page.reload();
    const reappeared = await waitFor(page, credOpen, 4000);
    check("stored credentials skip the overlay on reload", !reappeared);

    await browser.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})();
