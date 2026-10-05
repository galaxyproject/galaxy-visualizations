// The gap neither other tier can see: the artifact URL the agent emits, loaded against a real
// Galaxy. The eval tier grades the saved object, the stub tier renders against a fake server,
// so an address that Galaxy refuses to render passes both. Opt-in; needs a real Galaxy.
//
//   npm run build:session && GALAXY_ROOT=... GALAXY_KEY=... DATASET_ID=... VISUALIZATION=molstar \
//     node e2e/live-visualization-drive.cjs
const { execFileSync } = require("child_process");
const path = require("path");
const { chromium } = require("playwright");

const GALAXY = process.env.GALAXY_ROOT || "http://127.0.0.1:8080";
const KEY = process.env.GALAXY_KEY;
const DATASET = process.env.DATASET_ID;
const VISUALIZATION = process.env.VISUALIZATION || "molstar";

let failed = 0;
const check = (name, ok, detail) => {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// Ask the agent for the addresses rather than rebuilding them, or the test would assert its
// own idea of the contract instead of the one that ships: its built session runs the tools.
function artifactUrls() {
    const requests = [
        { op: "create", config: { galaxy_root: `${GALAXY}/`, galaxy_key: KEY, ai_provider: "galaxy" } },
        { op: "call", name: "show_visualization", args: { dataset_id: DATASET, visualization: VISUALIZATION } },
        {
            op: "call",
            name: "save_visualization",
            args: { dataset_id: DATASET, visualization: VISUALIZATION, title: "live drive" },
        },
        { op: "close" },
    ];
    const out = execFileSync("node", [path.join(__dirname, "..", "dist", "session.mjs")], {
        input: requests.map((r) => JSON.stringify(r)).join("\n") + "\n",
        encoding: "utf8",
    });
    const [, shown, saved] = out.trim().split("\n").map((line) => JSON.parse(line).result);
    // What the model reads, with the artifact the shell receives in place of its reference.
    const read = (r) => ({ ...JSON.parse(r.content).data, artifact: r.artifacts[0] });
    return { shown: read(shown), saved: read(saved) };
}

const manage = (id, action) =>
    fetch(`${GALAXY}/api/visualizations/${id}/${action}?key=${KEY}`, { method: "PUT" });

(async () => {
    if (!KEY || !DATASET) {
        console.log("set GALAXY_KEY and DATASET_ID (a dataset the visualization accepts)");
        process.exit(2);
    }
    const built = artifactUrls();
    const savedId = built.saved.visualization_id;
    // The browser is anonymous while the key owns the object, and this drive must not leave a
    // saved visualization behind on every run.
    if (savedId) {
        await manage(savedId, "enable_link_access");
    }
    check("showing saves nothing", built.shown.shown === true && !built.shown.visualization_id);
    check("saving returns an id", built.saved.saved === true && !!built.saved.visualization_id);

    const b = await chromium.launch();
    for (const [label, result] of [["shown", built.shown], ["saved", built.saved]]) {
        const url = result.artifact && result.artifact.url;
        if (!url) {
            check(`${label}: an artifact address was emitted`, false);
            continue;
        }
        const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
        await p.goto(`${GALAXY}/`, { waitUntil: "domcontentloaded" });
        await p.evaluate((t) => {
            document.body.innerHTML = `<iframe src="${t}" style="width:960px;height:660px;border:0"></iframe>`;
        }, url);
        await p.waitForTimeout(14000);
        const f = p.frames().find((x) => x.url().includes("/visualizations/display"));
        const state = f
            ? await f.evaluate(() => ({
                  frame: !!document.querySelector("#galaxy_visualization"),
                  chrome: !!document.querySelector("#masthead, #activity-bar, [class*='activity-bar']"),
                  alerts: [...document.querySelectorAll(".alert")]
                      .map((a) => a.innerText.trim().replace(/\s+/g, " "))
                      .filter((t) => t && !/anonymous user|history is empty/i.test(t)),
              }))
            : null;
        check(`${label}: Galaxy renders the address we emit`, !!state && state.frame,
              state ? JSON.stringify(state.alerts) : "no frame");
        check(`${label}: it renders without the analysis chrome`, !!state && !state.chrome);
        await p.close();
    }
    await b.close();
    if (savedId) {
        await manage(savedId, "disable_link_access");
        // Deletion is an update with the flag set; there is no DELETE on this resource.
        await fetch(`${GALAXY}/api/visualizations/${savedId}?key=${KEY}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deleted: true }),
        });
    }
    console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
    process.exit(failed ? 1 : 0);
})();
