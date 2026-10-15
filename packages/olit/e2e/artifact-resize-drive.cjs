// A chart sized to its container is measured when it is drawn. Drawn while the artifact pane is
// shut, it measured 0x0 and stayed blank under its title once the pane opened. Every way the pane
// opens or changes size must leave the chart drawn at the size it is shown at.
const playwright = require("playwright");
const storedProvider = require("./stored-provider.cjs");
const BROWSER = process.env.BROWSER || "chromium";
const STUB = "http://127.0.0.1:8099";
const APP = `${STUB}/plugins/visualizations/olit?dataset_id=d1&frame=1`;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const collapsed = (frame) => frame.locator("body").evaluate((b) => b.classList.contains("artifact-collapsed"));

/** The drawn chart's size, once it has had a moment to follow its container. */
async function chart(page, frame) {
    const svg = frame.locator("#artifact-content svg").first();
    await svg.waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
    const box = await svg.boundingBox().catch(() => null);
    return box ? { width: Math.round(box.width), height: Math.round(box.height) } : { width: 0, height: 0 };
}

const drawn = (size) => size.width > 0 && size.height > 0;
const shown = (size) => `${size.width}x${size.height}`;

(async () => {
    const browser = await playwright[BROWSER].launch();
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await storedProvider(page, { provider: "openrouter", baseUrl: `${STUB}/v1`, apiKey: "sk-or-v1-stubkeystubkey", model: "stub-model" });
    await fetch(`${STUB}/__script?name=chart`);
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    const frame = page.frameLocator("#galaxy_visualization");
    const ready = await frame.locator("text=/olit ready/i").first().waitFor({ timeout: 120000 }).then(() => true, () => false);
    check("Olit boots", ready);
    check("the pane starts shut", await collapsed(frame));

    await frame.locator("#input").fill("chart the counts");
    await frame.locator("#send-btn").click();
    await frame.locator("text=The chart is open.").first().waitFor({ timeout: 60000 });
    const live = await chart(page, frame);
    check("a chart drawn while the pane was shut renders once it opens", !(await collapsed(frame)) && drawn(live), shown(live));

    // Shut, reopened from the stored conversation, then opened by hand.
    await frame.locator("#artifact-btn").click();
    check("the button shuts the pane", await collapsed(frame));
    await page.reload({ waitUntil: "domcontentloaded" });
    await frame.locator("text=/olit ready/i").first().waitFor({ timeout: 120000 });
    await frame.locator("#artifact-content svg").first().waitFor({ state: "attached", timeout: 60000 });
    check("a reopened session draws its chart with the pane still shut", await collapsed(frame));
    await frame.locator("#artifact-btn").click();
    const restored = await chart(page, frame);
    check("a restored chart renders once the button opens the pane", drawn(restored), shown(restored));

    // Narrowing the pane by the divider must narrow the chart with it.
    const divider = await frame.locator("#divider").boundingBox();
    const y = divider.y + divider.height / 2;
    await page.mouse.move(divider.x + divider.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(divider.x + 200, y, { steps: 8 });
    await page.mouse.up();
    const narrowed = await chart(page, frame);
    check("the chart follows a divider drag", drawn(narrowed) && narrowed.width < restored.width - 100,
        `${shown(restored)} -> ${shown(narrowed)}`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
