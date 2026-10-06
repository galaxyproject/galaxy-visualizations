// Olit mounted as Galaxy mounts a plugin: into an iframe without a src, whose location is
// about:blank while its origin is Galaxy's. A visualization must still mount in the artifact pane,
// in a frame of its own inside that one, from the plugin's entry point on Galaxy.
const playwright = require("playwright");
const BROWSER = process.env.BROWSER || "chromium";
const STUB = "http://127.0.0.1:8099";
const APP = process.env.APP_URL || `${STUB}/plugins/visualizations/olit?history_id=h1&frame=1`;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

(async () => {
    const browser = await playwright[BROWSER].launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    const frame = page.frameLocator("#galaxy_visualization");
    const inner = () => page.frames().find((f) => f !== page.mainFrame());

    await frame.locator("#cred-provider").waitFor({ timeout: 30000 });
    check("the plugin's location is about:blank, as in Galaxy",
        (await inner().evaluate(() => window.location.href)) === "about:blank");
    await frame.locator("#cred-provider").selectOption("openrouter");
    await frame.locator("#cred-endpoint").fill(`${STUB}/v1`);
    await frame.locator("#cred-key").fill("sk-or-v1-stubkeystubkey");
    await frame.locator("#cred-model").fill("stub-model");
    await frame.locator("#cred-save").click();
    const ready = await frame.locator("text=/olit ready/i").first().waitFor({ timeout: 120000 })
        .then(() => true).catch(() => false);
    check("the agent boots inside the frame", ready);

    await fetch(`${STUB}/__script?name=visualization`);
    await frame.locator("#input").fill("open the structure in a viewer");
    await frame.locator("#send-btn").click();
    const plugin = frame.frameLocator("#artifact-content iframe").locator("#app");
    const shown = await plugin.filter({ hasText: "ngl mounted" }).waitFor({ timeout: 90000 })
        .then(() => true).catch(() => false);
    const text = await plugin.innerText({ timeout: 1000 }).catch(() => "");
    check("the plugin runs in the artifact pane", shown, text.slice(0, 120));
    check("with the config the artifact carries", /"mode":"cartoon"/.test(text));

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
