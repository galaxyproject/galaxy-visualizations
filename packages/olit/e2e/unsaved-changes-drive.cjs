// Galaxy embeds olit in an iframe and warns on unload while the session reports itself unsaved.
const { chromium } = require("playwright");
const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = process.env.STUB_URL || "http://127.0.0.1:8099";
const HISTORY = "e2ehistory0002";
const URL = `${APP}?history_id=${HISTORY}`;

let failed = 0;
function check(name, ok, detail) {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

(async () => {
    const { embedVisualization, galaxyMessages } = await import("../../../playwright.shared.mjs");
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });

    // The default scenario answers with a destructive call and opens the gate; this one just replies.
    await fetch(`${STUB}/__script?name=compact`);
    // The host page carries the Galaxy origin, so the plugin runs in a secure context as it does there.
    await page.goto(`${STUB}/__seen`);
    await embedVisualization(page, { src: URL });

    let frame;
    for (let i = 0; i < 60 && !frame; i++) {
        frame = page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith(APP));
        if (!frame) await page.waitForTimeout(500);
    }
    if (!frame) {
        check("the plugin loads in the frame", false, "no frame ever reached the app");
        await browser.close();
        process.exit(1);
    }

    const wait = async (fn, ms) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (await frame.evaluate(fn)) return true;
            await page.waitForTimeout(500);
        }
        return false;
    };
    const reports = async () => (await galaxyMessages(page)).filter((m) => m.visualization_saved !== undefined);
    const reported = async (saved, ms) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if ((await reports()).at(-1)?.visualization_saved === saved) return true;
            await page.waitForTimeout(500);
        }
        return false;
    };
    const idle = () => wait(() => !document.querySelector("#send-btn").classList.contains("hidden"), 60000);

    check("booted inside the frame", await wait(() => /olit ready/i.test(document.body.innerText), 60000));
    check("a conversation with nothing in it reports nothing", (await reports()).length === 0);

    await frame.fill("#input", "list my histories please");
    await frame.click("#send-btn");
    check("a turn reports the session unsaved", await reported(false, 60000));
    check("the report reaches the host from the frame", (await reports()).at(-1)?.fromEmbeddedFrame === true);

    check("the turn finished", await idle());
    await frame.click("#save-btn");
    check("saving reports the session saved", await reported(true, 20000));

    console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
    await browser.close();
    process.exit(failed ? 1 : 0);
})();
