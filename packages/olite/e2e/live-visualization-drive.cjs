// The gap neither other tier can see: the artifact URL the brain emits, loaded against a real
// Galaxy. The eval tier grades the saved object, the stub tier renders against a fake server,
// so an address that Galaxy refuses to render passes both. Opt-in; needs a real Galaxy.
//
//   GALAXY_ROOT=... GALAXY_KEY=... DATASET_ID=... VISUALIZATION=molstar \
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

// Ask the brain for the addresses rather than rebuilding them, or the test would assert its
// own idea of the contract instead of the one that ships.
function artifactUrls() {
    const program = `
import asyncio, json, os, urllib.request
from olite.drivers.loop import galaxy_tools

GALAXY, KEY = os.environ["GALAXY"], os.environ["KEY"]
DATASET, VISUALIZATION = os.environ["DATASET"], os.environ["VISUALIZATION"]

class Galaxy:
    def _call(self, path, body=None):
        sep = "&" if "?" in path else "?"
        req = urllib.request.Request(f"{GALAXY}/{path}{sep}key={KEY}",
                                     data=json.dumps(body).encode() if body else None,
                                     headers={"Content-Type": "application/json"},
                                     method="POST" if body is not None else "GET")
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    async def get(self, path, **kw): return self._call(path)
    async def post(self, path, body=None): return self._call(path, body or {})

async def main():
    g, args = Galaxy(), {"dataset_id": DATASET, "visualization": VISUALIZATION}
    shown = await galaxy_tools._show_visualization(g, args)
    saved = await galaxy_tools._save_visualization(g, dict(args, title="live drive"))
    print(json.dumps({"shown": shown, "saved": saved}))

asyncio.run(main())
`;
    const out = execFileSync("python3", ["-c", program], {
        cwd: path.join(__dirname, "..", "brain"),
        env: { ...process.env, GALAXY, KEY, DATASET, VISUALIZATION, PYTHONPATH: "." },
        encoding: "utf8",
    });
    return JSON.parse(out.trim().split("\n").pop());
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
