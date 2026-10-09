// A session whose browser state is gone, found again through the record Galaxy keeps attached to
// the history it was started on. The user decides whether this is that session; continuing it
// brings back the session's identity and record, and the record reaches the model as it always
// does, while the conversation itself, which was lost with the browser, stays lost.
const playwright = require("playwright");
const BROWSER = process.env.BROWSER || "chromium";
const STUB = "http://127.0.0.1:8099";
const LAUNCH = `${STUB}/plugins/visualizations/olit?dataset_id=drecover&frame=1`;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

/** A fresh browser profile, so nothing of an earlier session is stored: another machine. */
async function machine(browser) {
    const page = await (await browser.newContext()).newPage();
    await page.goto(LAUNCH, { waitUntil: "domcontentloaded" });
    const frame = page.frameLocator("#galaxy_visualization");
    await frame.locator("#cred-provider").waitFor({ timeout: 30000 });
    await frame.locator("#cred-provider").selectOption("openrouter");
    await frame.locator("#cred-endpoint").fill(`${STUB}/v1`);
    await frame.locator("#cred-key").fill("sk-or-v1-stubkeystubkey");
    await frame.locator("#cred-model").fill("stub-model");
    await frame.locator("#cred-save").click();
    return { page, frame };
}

const shown = (frame, pattern, ms = 120000) =>
    frame.locator(`text=${pattern}`).first().waitFor({ timeout: ms }).then(() => true, () => false);

(async () => {
    const browser = await playwright[BROWSER].launch();
    await fetch(`${STUB}/__script?name=record`);

    const first = await machine(browser);
    check("the first machine boots", await shown(first.frame, "/olit ready/i"));
    await first.frame.locator("#input").fill("start the record for this analysis");
    await first.frame.locator("#send-btn").click();
    check("the session writes its record", await shown(first.frame, "Noted in the record.", 60000));
    const record = (await (await fetch(`${STUB}/__pages`)).json()).pages.find((p) => /^olit-/.test(p.slug));
    check("the record is attached to the history the session was started on",
        record?.history_id === "h-drecover", JSON.stringify(record && { slug: record.slug, history: record.history_id }));

    await fetch(`${STUB}/__script?name=plain`);
    await fetch(`${STUB}/__forget`);
    const second = await machine(browser);
    check("another machine is offered the history's earlier record",
        await shown(second.frame, "/Continue the record/"));
    const early = await second.frame.locator("body").innerText();
    check("nothing starts before the user decides", !/olit ready/i.test(early));
    await second.frame.locator("button", { hasText: "Continue the record" }).first().click();
    check("continuing it starts the session", await shown(second.frame, "/olit ready/i"));
    check("continuing says the conversation is gone", await shown(second.frame, "/this chat starts empty/"));
    const restored = await second.frame.locator("body").innerText();
    check("the lost conversation is not reconstructed", !restored.includes("start the record for this analysis"));

    await second.frame.locator("#input").fill("what have we done so far?");
    await second.frame.locator("#send-btn").click();
    await shown(second.frame, "Noted.", 60000);
    const { prompts } = await (await fetch(`${STUB}/__seen`)).json();
    const sent = prompts.at(-1)?.tail || "";
    check("the model reads the session's record through the record context",
        sent.includes("The record (current contents)") && sent.includes(record?.id), sent.slice(-300));

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
