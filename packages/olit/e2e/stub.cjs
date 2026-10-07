// Stands in for the provider and Galaxy; scripted per scenario via /__script.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// Where Galaxy serves a visualization plugin from, and the host page it renders.
const PLUGIN_HREF = "/static/plugins/visualizations/olit/static";
// The history a dataset lives in, as Galaxy reports it on the dataset: drives choose a history
// by the dataset they launch on, `d1` and the dev default living in `h1`.
const historyOf = (datasetId) => (["d1", "__test__"].includes(datasetId) ? "h1" : `h-${datasetId}`);
// A plugin the artifact pane mounts, declaring its own entry point as Galaxy's plugin API does.
const NGL_HREF = "/static/plugins/visualizations/ngl/static";
const NGL = {
    name: "ngl",
    href: NGL_HREF,
    entry_point: { attr: { src: "dist/viewer.js", type: "module" } },
    settings: [{ name: "mode", type: "text" }],
    tracks: [],
};
// Shows what it was handed, so a drive can read the config the pane mounted it with.
const NGL_MODULE = [
    "const app = document.getElementById('app');",
    "const incoming = JSON.parse(app.dataset.incoming);",
    "app.textContent = 'ngl mounted ' + JSON.stringify(incoming.visualization_config);",
].join("\n");
const HOST_PAGE = "/plugins/visualizations/olit";
const TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".map": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".md": "text/markdown",
};

let script = "confirm";
// Saved visualizations as Galaxy keeps them: each a type, a title and its latest revision's config.
const visualizations = new Map();
const visualizationWrites = [];
// One tool run's job, as Galaxy reports it; a drive finishes it through /__job.
let jobState = "queued";
// Pages as Galaxy keeps them: a page may be attached to a history (a history notebook) and listed by it.
const pages = new Map();
// The cell types Galaxy's page parser renders; its server refuses any other ``` fence.
const PAGE_CELLS = ["galaxy", "markdown", "vega", "visualization", "vitessce"];
const badFence = (content) =>
    String(content || "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("```") && line.length > 3 && !PAGE_CELLS.includes(line.slice(3)));     // confirm | slow | slow-once | compact | ratelimit | plan | plan-after-graph
let galaxyUp = true;        // /api/version answers, which is what the agent probes for reachability
let rateLimited = 0;
let calls = 0;
const seen = [];            // every Galaxy request the agent actually made
const cookies = [];         // each Galaxy request's URL and the session cookie it carried
const prompts = [];         // what the agent sent us, so compaction can be checked

function json(res, code, body) {
    const text = JSON.stringify(body);
    res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
    });
    res.end(text);
}

// A completion as the server-sent events a streaming request reads.
function sse(res, completion) {
    const { message: m, finish_reason } = completion.choices[0];
    const chunks = [];
    if (m.content) chunks.push({ choices: [{ index: 0, delta: { content: m.content } }] });
    (m.tool_calls || []).forEach((call, index) => chunks.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, ...call }] } }] }));
    chunks.push({ choices: [{ index: 0, delta: {}, finish_reason }], usage: completion.usage });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" });
    res.end(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n");
}

// A realistic `usage` is what lets the compaction scenario trigger.
const message = (content, tool_calls, promptTokens = 50000) => ({
    choices: [{ finish_reason: tool_calls ? "tool_calls" : "stop", message: { role: "assistant", content, tool_calls } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: 20, total_tokens: promptTokens + 20 },
});

const deleteHistory = [{
    id: "call_1",
    type: "function",
    function: { name: "update_history", arguments: JSON.stringify({ history_id: "h1", deleted: true }) },
}];

// Top-level await plus a cross-origin pyfetch: the two things a sync exec could not do.
const RUN_PYTHON_CODE = [
    "import asyncio",
    "await asyncio.sleep(0)",
    "r = await pyfetch('http://127.0.0.1:8099/__seen')",
    "body = await r.string()",
    "f\"awaited:{r.status}:{'calls' in body}\"",
].join("\n");

// What run_python can reach from its realm. Every request it makes is tagged, so the stub can
// say whether Galaxy's session cookie came with it.
const ISOLATION_PROBE = [
    "import js, json",
    "out = {'origin': str(js.self.origin)}",
    "r = await pyfetch('http://127.0.0.1:8099/__public?from=python')",
    "out['cors'] = r.status",
    "for creds in ('same-origin', 'include'):",
    "    try:",
    "        r = await pyfetch(f'http://127.0.0.1:8099/api/users/current?from=python&credentials={creds}', credentials=creds)",
    "        out[creds] = await r.string()",
    "    except Exception:",
    "        out[creds] = 'unreadable'",
    "try:",
    "    await pyfetch('http://127.0.0.1:8099/api/histories?from=python&credentials=post', method='POST', credentials='include', body='{}', headers={'content-type': 'text/plain'})",
    "except Exception:",
    "    pass",
    "try:",
    "    js.indexedDB.open('olit')",
    "    out['storage'] = 'open'",
    "except Exception:",
    "    out['storage'] = 'blocked'",
    "out['canary'] = bool(getattr(js.self, '__olitCanary', False))",
    "names = js.Object.getOwnPropertyNames(js.self).to_py()",
    "out['key'] = any('sk-e2e-canary' in str(getattr(js.self, n, '')) for n in names if n != 'out')",
    "'probe:' + json.dumps(out)",
].join("\n");

const runIsolationProbe = [{
    id: "call_1",
    type: "function",
    function: { name: "run_python", arguments: JSON.stringify({ code: ISOLATION_PROBE }) },
}];

const runForever = [{
    id: "call_1",
    type: "function",
    function: { name: "run_python", arguments: JSON.stringify({ code: "while True: pass" }) },
}];

const runPython = [{
    id: "call_1",
    type: "function",
    function: { name: "run_python", arguments: JSON.stringify({ code: RUN_PYTHON_CODE }) },
}];

// A spread of the operations galaxy-ops runs instead of a handler here: a paginated read, two
// that shape their answer from a tool's schema, one that pages a list Galaxy will not page,
// and a write. Kept small enough that the turn fits the drive's context budget uncompacted.
const delegatedOps = [
    { id: "call_1", type: "function", function: { name: "get_histories", arguments: JSON.stringify({ limit: 2 }) } },
    { id: "call_2", type: "function", function: { name: "get_tool_run_examples", arguments: JSON.stringify({ tool_id: "cat1" }) } },
    { id: "call_3", type: "function", function: { name: "get_tool_input_template", arguments: JSON.stringify({ tool_id: "cat1" }) } },
    { id: "call_4", type: "function", function: { name: "get_tool_panel", arguments: JSON.stringify({ limit: 3 }) } },
    { id: "call_5", type: "function", function: { name: "create_history", arguments: JSON.stringify({ history_name: "olit e2e ops" }) } },
];

// A process that fails here: the stub answers history contents with a history, not a list.
const runAProcess = [{
    id: "call_1",
    type: "function",
    function: { name: "organize_datasets", arguments: JSON.stringify({ history_id: "__test__" }) },
}];

const createVisualization = [{
    id: "call_1",
    type: "function",
    function: {
        name: "show_visualization",
        arguments: JSON.stringify({ dataset_id: "d1", visualization: "ngl", settings: { mode: "cartoon" } }),
    },
}];

// Two turns, two differently titled artifacts, so a drive can tell which one the pane shows.
const showTitled = (title) => [{
    id: "call_1",
    type: "function",
    function: {
        name: "show_visualization",
        arguments: JSON.stringify({ dataset_id: "d1", visualization: "ngl", title }),
    },
}];

// Galaxy parses olit.xml server-side and hands the specs back through data-incoming;
// reading the file keeps the harness on the same prompt the deployment would serve.
function pluginSpecs() {
    const xml = fs.readFileSync(path.join(ROOT, "public", "olit.xml"), "utf8");
    const found = xml.match(/<ai_prompt>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ai_prompt>/);
    return { ai_prompt: found ? found[1].trim() : "" };
}

// The shape VisualizationFrame reads from /api/plugins/<name> to build data-incoming.
/** The `<entry_point>` attributes olit.xml declares, as Galaxy's plugin API returns them. */
function entryPoint() {
    const xml = fs.readFileSync(path.join(ROOT, "public", "olit.xml"), "utf8");
    const tag = xml.match(/<entry_point\b([^>]*)\/?>/)[1];
    return Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

function pluginDict() {
    return {
        name: "olit",
        html: "AI Research Assistant",
        embeddable: true,
        href: PLUGIN_HREF,
        entry_point: { attr: entryPoint() },
        specs: pluginSpecs(),
        settings: [],
    };
}

function serveStatic(res, rel) {
    const file = path.join(ROOT, "static", rel);
    if (!file.startsWith(path.join(ROOT, "static")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("not found");
    }
    // No CORS headers: Galaxy sends none on static files.
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    return res.end(fs.readFileSync(file));
}

const escapeAttr = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// What VisualizationFrame.vue builds in the browser, rendered here instead: the same
// data-incoming, the same plugin href, so a built app resolves Pyodide the way it does
// in a deployment rather than from the dev server. VisualizationDisplay.vue hands a plugin
// opened on a dataset `{ dataset_id }` and nothing else: no history, and a title only for a
// saved visualization.
function hostPage(url) {
    const params = new URL(url, "http://127.0.0.1:8099").searchParams;
    const datasetId = params.get("dataset_id");
    // A saved one opens on its latest revision's config, with its id for the owner (u1).
    const saved = visualizations.get(params.get("visualization_id"));
    const incoming = {
        root: "http://127.0.0.1:8099/",
        visualization_config: saved
            ? saved.latest_revision.config
            : datasetId
              ? { dataset_id: datasetId }
              : {},
        visualization_plugin: pluginDict(),
        ...(saved ? { visualization_id: saved.id, visualization_title: saved.title } : {}),
    };
    if (params.get("frame")) {
        // As Galaxy's VisualizationFrame.vue mounts a plugin: it asks the plugin API for the
        // entry point, then fills an iframe without a src, whose location stays about:blank.
        const mount = [
            "(async () => {",
            "  const plugin = await (await fetch('/api/plugins/olit')).json();",
            "  const doc = document.getElementById('galaxy_visualization').contentDocument;",
            "  const app = doc.createElement('div');",
            "  app.id = 'app';",
            `  app.setAttribute('data-incoming', JSON.stringify({ ...${JSON.stringify(incoming)}, root: window.location.origin + '/', visualization_plugin: plugin }));`,
            "  doc.body.appendChild(app);",
            "  const attr = plugin.entry_point.attr;",
            "  const script = doc.createElement('script');",
            "  script.type = attr.type || 'module';",
            "  script.src = `${plugin.href}/${attr.src}`;",
            "  doc.body.appendChild(script);",
            "  if (attr.css) {",
            "    const link = doc.createElement('link');",
            "    link.rel = 'stylesheet';",
            "    link.href = `${plugin.href}/${attr.css}`;",
            "    doc.head.appendChild(link);",
            "  }",
            "})();",
        ].join("\n");
        return [
            "<!doctype html>",
            '<html lang="en"><head><meta charset="UTF-8" /></head><body style="margin:0">',
            '<iframe id="galaxy_visualization" title="visualization" style="width:100vw;height:100vh;border:0"></iframe>',
            `<script>${mount}<\/script>`,
            "</body></html>",
        ].join("\n");
    }
    return [
        "<!doctype html>",
        '<html lang="en"><head><meta charset="UTF-8" />',
        `<link rel="stylesheet" href="${PLUGIN_HREF}/index.css" />`,
        "</head><body>",
        `<div id="app" data-incoming="${escapeAttr(JSON.stringify(incoming))}"></div>`,
        `<script type="module" src="${PLUGIN_HREF}/index.js"><\/script>`,
        "</body></html>",
    ].join("\n");
}

const server = http.createServer(async (req, res) => {
    const url = req.url || "";
    if (req.method === "OPTIONS") return json(res, 204, {});

    if (url.startsWith("/__script")) {
        script = new URL(url, "http://x").searchParams.get("name") || "confirm";
        calls = 0;
        rateLimited = 0;
        seen.length = 0;
        cookies.length = 0;
        return json(res, 200, { script });
    }
    // Drives that assert on what the model was sent need the record to start empty;
    // `/__script` deliberately keeps it, because a drive may switch scripts mid-turn.
    // The agent probes /api/version once per session; a drive needs Galaxy down before it boots.
    if (url.startsWith("/__galaxy")) {
        galaxyUp = new URL(url, "http://x").searchParams.get("up") !== "0";
        return json(res, 200, { galaxyUp });
    }
    if (url.startsWith("/__forget")) {
        prompts.length = 0;
        return json(res, 200, { prompts: 0 });
    }
    if (url.startsWith("/__seen")) return json(res, 200, { seen, calls, prompts, cookies });
    if (url.startsWith("/__job")) {
        jobState = new URL(url, "http://x").searchParams.get("state") || jobState;
        return json(res, 200, { jobState });
    }
    if (url.startsWith("/__pages")) return json(res, 200, { pages: [...pages.values()] });
    if (url.startsWith("/__visualizations")) return json(res, 200, { visualizations: [...visualizations.values()], writes: visualizationWrites });
    if (url.startsWith("/__public")) return json(res, 200, { public: true });

    if (url.startsWith(`${NGL_HREF}/${NGL.entry_point.attr.src}`)) {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        return res.end(NGL_MODULE);
    }
    if (url.startsWith(PLUGIN_HREF)) return serveStatic(res, url.slice(PLUGIN_HREF.length).split("?")[0]);
    if (url === "/" || url.startsWith(HOST_PAGE)) {
        // Galaxy's session cookie, with no SameSite, as Galaxy sets it.
        res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "galaxysession=e2e-session; Path=/; HttpOnly" });
        return res.end(hostPage(url));
    }

    if (url.includes("/chat/completions")) {
        calls += 1;
        const body = await new Promise((resolve) => {
            let raw = "";
            req.on("data", (c) => (raw += c));
            req.on("end", () => {
                try {
                    resolve(JSON.parse(raw));
                } catch {
                    resolve({});
                }
            });
        });
        prompts.push({
            hasTools: Array.isArray(body.tools) && body.tools.length > 0,
            roles: (body.messages || []).map((m) => m.role),
            toolResults: (body.messages || []).filter((m) => m.role === "tool").map((m) => String(m.content)),
            text: JSON.stringify(body.messages || []).slice(0, 4000),
            // The record excerpt rides just before the last user message, past where `text` stops.
            tail: JSON.stringify(body.messages || []).slice(-6000),
            authorization: req.headers.authorization || null,
        });
        const answer = (completion) => (body.stream ? sse(res, completion) : json(res, 200, completion));
        // A summarization request is the one with no tools, whatever the scenario.
        const isSummarization = !prompts[prompts.length - 1].hasTools;
        if (isSummarization) {
            return answer(message("## Goal\nthe summarized goal"));
        }
        if (script === "ratelimit") {
            // First call 429s with a stated delay, as Gemini does; then succeed.
            if (rateLimited === 0) {
                rateLimited = 1;
                res.writeHead(429, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
                return res.end(JSON.stringify([{
                    error: {
                        code: 429,
                        message: "You exceeded your current quota",
                        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "6s" }],
                    },
                }]));
            }
            return answer(message("recovered after the wait"));
        }
        if (script === "slow-once") {
            // The first answer is slow enough that a reload lands while it is in flight.
            if (calls === 1) {
                await new Promise((r) => setTimeout(r, 15000));
                return answer(message("the abandoned answer"));
            }
            return answer(message("The answer after the reload."));
        }
        if (script === "slow") {
            // Long enough that Stop lands while the request is in flight.
            await new Promise((r) => setTimeout(r, 60000));
            return answer(message("too late"));
        }
        if (script === "plan" || script === "plan-after-process") {
            // A drive that needs a process to have failed takes it before asking for a plan.
            const msgs = body.messages || [];
            const asked = msgs.some((m) => m.role === "tool");
            if (script === "plan-after-process" && !asked) {
                return answer(message("", runAProcess));
            }
            // A plan card, so the driver has an Approve button to click.
            return answer(message(
                "```plan\n## Plan A: Stub Plan [galaxy]\n\n" +
                "Draft used only to render an approvable card.\n\n### Steps\n\n" +
                "- [ ] 1. **Concatenate the inputs** -- join the two datasets\n" +
                "  - Routing: galaxy\n  - Tool: cat\n" +
                "  - Verification: confirm the output exists and is non-empty\n```",
            ));
        }
        if (script === "compact") {
            return answer(message("ok"));
        }
        if (script === "ops-bridge") {
            const msgs = body.messages || [];
            const tail = msgs[msgs.length - 1] || {};
            return answer(tail.role === "tool"
                ? message("operations answered")
                : message("", delegatedOps));
        }
        if (script === "python-isolation") {
            const msgs = body.messages || [];
            const tail = msgs[msgs.length - 1] || {};
            return answer(tail.role === "tool"
                ? message(`python returned ${tail.content}`)
                : message("", runIsolationProbe));
        }
        if (script === "python-forever") {
            const tail = (body.messages || []).slice(-1)[0] || {};
            return answer(tail.role === "tool" ? message(`python returned ${tail.content}`) : message("", runForever));
        }
        if (script === "python") {
            const msgs = body.messages || [];
            const tail = msgs[msgs.length - 1] || {};
            return answer(tail.role === "tool"
                ? message(`python returned ${tail.content}`)
                : message("", runPython));
        }
        // Keyed on the last message; by turn two the transcript always has a tool result.
        const messages = body.messages || [];
        const last = messages[messages.length - 1] || {};
        if (script === "two-artifacts") {
            const turns = messages.filter((m) => m.role === "user").length;
            return answer(last.role === "tool"
                ? message(`Chart ${turns} is open.`)
                : message("", showTitled(turns < 2 ? "First Chart" : "Second Chart")));
        }
        if (script === "visualization") {
            return answer(last.role === "tool"
                ? message("The structure is open in the viewer.")
                : message("", createVisualization));
        }
        if (script === "plain") return answer(message("Noted."));
        if (script === "linked") return answer(message("Dataset 0123456789abcdef is ready."));
        if (script === "reset-watch") {
            // Open the record, run a tool, then say so; anything asked after that is a follow-up.
            const tools = (body.messages || []).filter((m) => m.role === "tool").length;
            const call = (name, args) => [{ id: `call_${tools}`, type: "function", function: { name, arguments: JSON.stringify(args) } }];
            if (tools === 0) return answer(message("", call("notebook_resume", {})));
            if (tools === 1) return answer(message("", call("run_tool", { history_id: "h-dreset", tool_id: "cat1", inputs: {} })));
            return answer(message("Submitted."));
        }
        if (script === "record") {
            return answer(last.role === "tool"
                ? message("Noted in the record.")
                : message("", [{ id: "call_1", type: "function", function: { name: "notebook_resume", arguments: "{}" } }]));
        }
        return answer(last.role === "tool" ? message("Done.") : message("", deleteHistory));
    }

    // Everything else is Galaxy; record it so tests can assert on the PUT.
    seen.push(`${req.method} ${url}`);
    cookies.push({ url: `${req.method} ${url}`, cookie: req.headers.cookie || null });
    if (!galaxyUp && url.includes("/api/")) return json(res, 503, { err_msg: "galaxy is down" });
    if (url.includes("/api/plugins/olit")) return json(res, 200, pluginDict());
    if (url.includes("/api/plugins/ngl")) return json(res, 200, NGL);
    if (url.includes("/api/plugins")) return json(res, 200, [{ name: "ngl", settings: [], tracks: [] }]);
    if (url.includes("/api/datatypes/")) return json(res, 200, [{ visualization: "ngl" }]);
    if (url.includes("/api/users/current")) {
        // Galaxy answers a signed-in user with its id; an anonymous one has none.
        return json(res, 200, /galaxysession=/.test(req.headers.cookie || "") ? { id: "u1", username: "e2e-user" } : {});
    }
    if (url.includes("/api/datasets/")) {
        const id = decodeURIComponent(url.split("/api/datasets/")[1].split(/[/?]/)[0]);
        return json(res, 200, { id, name: "peptide.pdb", extension: "pdb", history_id: historyOf(id) });
    }
    // A tool run as Galaxy's POST /api/tools answers it: the queued job and the output it will write.
    if (url.startsWith("/api/tools") && req.method === "POST") {
        req.resume();
        return json(res, 200, {
            outputs: [{ id: "oreset1", name: "out_file1", state: "queued" }],
            jobs: [{ id: "jreset1", state: "queued", tool_id: "cat1" }],
        });
    }
    if (url.startsWith("/api/jobs/jreset1")) return json(res, 200, { id: "jreset1", state: jobState });
    if (url.startsWith("/api/pages")) {
        const [path, search] = url.split("?");
        const id = path.split("/")[3];
        if (req.method === "GET" && !id) {
            const history = new URLSearchParams(search || "").get("history_id");
            const listed = [...pages.values()].filter((p) => !history || p.history_id === history);
            return json(res, 200, listed.map(({ content, content_editor, ...summary }) => summary));
        }
        if (req.method === "GET") {
            const found = pages.get(id);
            return found ? json(res, 200, found) : json(res, 404, { err_msg: "Page not found" });
        }
        const body = await new Promise((resolve) => {
            let raw = "";
            req.on("data", (c) => (raw += c));
            req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
        });
        const fence = badFence(body.content);
        if (fence) return json(res, 400, { err_msg: `Unsupported fenced block type [${fence.slice(3)}].` });
        const now = new Date().toISOString();
        if (req.method === "POST") {
            const created = `p${pages.size + 1}`;
            pages.set(created, {
                id: created,
                slug: body.slug,
                title: body.title,
                history_id: body.history_id ?? null,
                content: body.content,
                content_editor: body.content,
                create_time: now,
                update_time: now,
                deleted: false,
            });
            return json(res, 200, pages.get(created));
        }
        const found = pages.get(id);
        if (!found) return json(res, 404, { err_msg: "Page not found" });
        Object.assign(found, { content: body.content, content_editor: body.content, update_time: now });
        return json(res, 200, found);
    }
    if (url.startsWith("/api/visualizations")) {
        const id = url.split("?")[0].split("/")[3];
        if (req.method === "GET") {
            if (!id) return json(res, 200, [...visualizations.values()]);
            const found = visualizations.get(id);
            return found ? json(res, 200, found) : json(res, 404, { err_msg: "Visualization not found" });
        }
        const body = await new Promise((resolve) => {
            let raw = "";
            req.on("data", (c) => (raw += c));
            req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
        });
        visualizationWrites.push(`${req.method} ${id || ""}`.trim());
        if (req.method === "POST") {
            const created = `v${visualizations.size + 1}`;
            visualizations.set(created, {
                id: created,
                type: body.type,
                title: body.title,
                user_id: "u1",
                latest_revision: { config: body.config, title: body.title },
            });
            return json(res, 200, { id: created });
        }
        const found = visualizations.get(id);
        if (!found) return json(res, 404, { err_msg: "Visualization not found" });
        found.title = body.title || found.title;
        found.latest_revision = { config: body.config || found.latest_revision.config, title: found.title };
        return json(res, 200, { id });
    }
    if (url.includes("/api/histories")) return json(res, 200, { id: "h1", name: "stub" });
    if (url.startsWith("/history/current_history_json")) return json(res, 200, { id: "h1", name: "stub" });
    return json(res, 200, {});
});

server.listen(8099, () => console.log("stub on 8099"));
