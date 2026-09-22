// The chat/artifact split must be adjustable: drag, toggle, shortcut, and a narrow
// window must collapse the pane without overwriting the stored preference.
const { chromium } = require("playwright");
const APP = process.env.APP_URL || "http://localhost:4173/";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const collapsed = (p) => p.evaluate(() => document.body.classList.contains("artifact-collapsed"));
const stored = (p) => p.evaluate(() => localStorage.getItem("olite.artifactCollapsed"));

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(APP);
    await page.waitForSelector("#cred-overlay:not(.hidden)", { timeout: 20000 });
    await page.selectOption("#cred-provider", "openrouter");
    await page.fill("#cred-key", "demo");
    await page.click("#cred-save");
    await page.waitForFunction(() => (document.querySelector("#model-btn")?.textContent||"").includes("·"));

    check("starts collapsed", await collapsed(page));

    // Nothing has been produced yet, so there is nothing to open and nothing to offer.
    const btnHidden = () => page.evaluate(() => document.querySelector("#artifact-btn").classList.contains("hidden"));
    check("no button while the pane is empty", await btnHidden());
    await page.keyboard.press("Control+\\");
    check("the shortcut cannot open an empty pane", await collapsed(page));

    // A turn fills the pane; this driver is about the pane itself, so it fills it directly.
    await page.evaluate(() => {
        document.querySelector("#artifact-content").innerHTML = "<p>chart</p>";
    });
    await page.waitForSelector("#artifact-btn:not(.hidden)", { timeout: 5000 });
    check("the button appears once there is something to show", !(await btnHidden()));

    await page.click("#artifact-btn");
    check("toggle button expands", !(await collapsed(page)));
    check("expansion is persisted", (await stored(page)) === "0");

    await page.click("#artifact-btn");
    check("toggle button collapses again", await collapsed(page));

    await page.keyboard.press("Control+\\");
    check("Ctrl+\\ toggles", !(await collapsed(page)));

    // Emptying the pane is what a session reset does, and it used to leave the chart on screen.
    await page.evaluate(() => {
        document.querySelector("#artifact-content").innerHTML = "";
    });
    await page.waitForFunction(() => document.querySelector("#artifact-btn").classList.contains("hidden"), { timeout: 5000 });
    check("emptying the pane shuts and hides it", (await collapsed(page)) && (await btnHidden()));
    await page.evaluate(() => {
        document.querySelector("#artifact-content").innerHTML = "<p>chart</p>";
    });
    await page.waitForSelector("#artifact-btn:not(.hidden)", { timeout: 5000 });
    // No click needed: the preference still says expanded, and there is something to show again.
    check("reopens itself once there is something to show again", !(await collapsed(page)));

    // Drag the divider; the chat pane's flex basis should change and stay clamped.
    const before = await page.evaluate(() => document.querySelector("#chat-pane").style.flex || "");
    const box = await page.locator("#divider").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(300, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const after = await page.evaluate(() => document.querySelector("#chat-pane").style.flex || "");
    check("divider drag resizes the chat pane", after !== before && after.includes("%"), `${before || "(none)"} -> ${after}`);

    const pct = parseFloat(after.match(/([\d.]+)%/)[1]);
    check("drag is clamped to 25-75%", pct >= 25 && pct <= 75, `${pct.toFixed(1)}%`);

    // The clamp alone would pass even if the maths were wrong, so drag to a middle
    // position and check the pane actually tracks the pointer.
    const box2 = await page.locator("#divider").boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.mouse.move(720, box2.y + box2.height / 2, { steps: 8 });
    await page.mouse.up();
    const mid = parseFloat(
        (await page.evaluate(() => document.querySelector("#chat-pane").style.flex)).match(/([\d.]+)%/)[1]);
    check("drag tracks the pointer between the clamps", mid > 50 && mid < 70, `${mid.toFixed(1)}% for x=720 of 1200`);

    check("drag releases the cursor and text selection",
        await page.evaluate(() => !document.body.style.cursor && !document.body.style.userSelect));

    // Collapsing after a drag must give the chat pane the full width back: the drag
    // writes an inline flex-basis that outranks the stylesheet's collapsed rule.
    const fullWidth = await page.evaluate(() => document.querySelector("#app-main").getBoundingClientRect().width);
    const paneWidth = () => page.evaluate(() => +document.querySelector("#chat-pane").getBoundingClientRect().width.toFixed(0));
    await page.click("#artifact-btn");
    check("collapsing after a drag restores full width",
        Math.abs((await paneWidth()) - fullWidth) < 2, `${await paneWidth()} of ${fullWidth}`);
    // Matches upstream: re-expanding returns to the CSS default rather than the
    // dragged split, so only the full-width restore is asserted.
    await page.click("#artifact-btn");

    // Narrow the window: collapses visually, must not rewrite the preference.
    const prefBefore = await stored(page);
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForTimeout(300);
    check("narrow window collapses the pane", await collapsed(page));
    check("narrow window leaves the preference alone", (await stored(page)) === prefBefore,
        `${prefBefore} -> ${await stored(page)}`);

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(300);
    check("widening restores the stored preference", !(await collapsed(page)));

    // The composer must not show a scrollbar while its content still fits.
    const composer = (n) => page.evaluate((n) => {
        const i = document.querySelector("#input");
        i.value = Array.from({ length: n }, (_, k) => "line " + k).join("\n");
        i.dispatchEvent(new Event("input"));
        return { clipped: i.scrollHeight > i.clientHeight, overflowY: getComputedStyle(i).overflowY };
    }, n);
    const one = await composer(1);
    check("single-line composer shows no scrollbar", !one.clipped && one.overflowY === "hidden", JSON.stringify(one));
    const many = await composer(20);
    check("composer scrolls once it hits the max height", many.overflowY === "auto", JSON.stringify(many));
    await page.evaluate(() => { const i = document.querySelector("#input"); i.value = ""; i.dispatchEvent(new Event("input")); });

    // Usage starts hidden: an empty "0 tok" pill before the first turn is noise.
    check("usage bar is hidden before any turn",
        await page.evaluate(() => document.querySelector("#usage-bar").classList.contains("hidden")));
    check("usage cost is empty until a provider reports one",
        await page.evaluate(() => document.querySelector("#usage-cost").textContent === ""));

    await browser.close();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})();
