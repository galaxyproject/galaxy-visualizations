// A saved Olit session, opened again from Galaxy's visualization list on another machine: Galaxy
// hands the plugin the saved config and, for its owner, the visualization id. The conversation must
// come back as saved, and saving it again must revise that visualization, not add another.
const playwright = require("playwright");
const BROWSER = process.env.BROWSER || "chromium";
const STUB = "http://127.0.0.1:8099";
const HOST = `${STUB}/plugins/visualizations/olit`;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

/** A fresh browser profile, so nothing of an earlier session is stored: another machine. */
async function machine(browser, url, booting = true) {
    const page = await (await browser.newContext()).newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const frame = page.frameLocator("#galaxy_visualization");
    await frame.locator("#cred-provider").waitFor({ timeout: 30000 });
    await frame.locator("#cred-provider").selectOption("openrouter");
    await frame.locator("#cred-endpoint").fill(`${STUB}/v1`);
    await frame.locator("#cred-key").fill("sk-or-v1-stubkeystubkey");
    await frame.locator("#cred-model").fill("stub-model");
    await frame.locator("#cred-save").click();
    if (!booting) return { page, frame, ready: false };
    const ready = await frame
        .locator("text=/olit ready/i")
        .first()
        .waitFor({ timeout: 120000 })
        .then(() => true)
        .catch(() => false);
    return { page, frame, ready };
}

async function say(frame, text) {
    await frame.locator("#input").fill(text);
    await frame.locator("#send-btn").click();
    await frame.locator("text=Noted.").last().waitFor({ timeout: 60000 });
}

const stored = async () => (await fetch(`${STUB}/__visualizations`)).json();

/** Save once the turn has ended, and wait for the write it makes; the stub serves every drive. */
async function save(frame) {
    const before = (await stored()).writes.length;
    await frame.locator("#save-btn:not([disabled])").click({ timeout: 30000 });
    for (let i = 0; i < 40; i++) {
        const now = await stored();
        if (now.writes.length > before) return now;
        await new Promise((r) => setTimeout(r, 250));
    }
    return stored();
}

(async () => {
    await fetch(`${STUB}/__script?name=plain`);
    const browser = await playwright[BROWSER].launch();

    const first = await machine(browser, `${HOST}?dataset_id=dsaved&frame=1`);
    check("the first machine boots", first.ready);
    await say(first.frame, "remember the saved session marker");
    const known = new Set((await stored()).visualizations.map((v) => v.id));
    const saved = await save(first.frame);
    const made = saved.visualizations.filter((v) => !known.has(v.id));
    const visualization = made[0];
    check(
        "saving creates one Olit visualization",
        made.length === 1 && visualization?.type === "olit",
        JSON.stringify(saved.writes.slice(-2)),
    );

    const second = await machine(browser, `${HOST}?visualization_id=${visualization?.id}&frame=1`);
    check("the second machine boots on the saved visualization", second.ready);
    const text = await second.frame.locator("body").innerText();
    check(
        "the conversation comes back as saved",
        text.includes("remember the saved session marker"),
        text.replace(/\s+/g, " ").slice(0, 300),
    );
    check("it is said to be the saved session", /Opened a saved Olit session/.test(text));
    check("nothing claims the load failed", !/Could not open saved session/.test(text));

    await say(second.frame, "and one more turn");
    const after = await save(second.frame);
    check(
        "saving again revises that visualization rather than adding one",
        after.visualizations.length === saved.visualizations.length &&
            after.writes.at(-1) === `PUT ${visualization?.id}`,
        JSON.stringify(after.writes.slice(-2)),
    );

    // The same session, now another user's: shared with this one, or open to anyone with its link.
    for (const owner of ["u2", ""]) {
        await fetch(`${STUB}/__owner?id=${visualization?.id}&user_id=${owner}`);
        const asked = (await (await fetch(`${STUB}/__seen`)).json()).prompts.length;
        const other = await machine(browser, `${HOST}?visualization_id=${visualization?.id}&frame=1`, false);
        const whose = owner ? "another user's session" : "a session with no owner";
        const refused = await other.frame
            .locator("text=/Olit opens only your own sessions/")
            .first()
            .waitFor({ timeout: 30000 })
            .then(() => true, () => false);
        check(`${whose} is refused`, refused);
        const shown = await other.frame.locator("body").innerText();
        check(`none of ${whose} is shown`, !shown.includes("remember the saved session marker"));
        check(`${whose} leaves nothing to write in`, await other.frame.locator("#input").isDisabled());
        const sent = (await (await fetch(`${STUB}/__seen`)).json()).prompts.length;
        check(`${whose} reaches no model`, sent === asked, `${asked} -> ${sent} prompts`);
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
