// Stands in for the provider and Galaxy; scripted per scenario via /__script.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// Where Galaxy serves a visualization plugin from, and the host page it renders.
const PLUGIN_HREF = "/static/plugins/visualizations/olit/static";
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

let script = "confirm";     // confirm | slow | compact | ratelimit
let rateLimited = 0;
let calls = 0;
const seen = [];            // every Galaxy request the brain actually made
const prompts = [];         // what the brain sent us, so compaction can be checked

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

// A realistic `usage` is what lets the compaction scenario trigger.
const message = (content, tool_calls, promptTokens = 30000) => ({
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

const createVisualization = [{
    id: "call_1",
    type: "function",
    function: {
        name: "show_visualization",
        arguments: JSON.stringify({ dataset_id: "d1", visualization: "ngl" }),
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
function pluginDict() {
    return {
        name: "olit",
        html: "AI Research Assistant",
        embeddable: true,
        href: PLUGIN_HREF,
        entry_point: { attr: { entry_point_type: "script", src: "index.js", css: "index.css" } },
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
    res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
    });
    return res.end(fs.readFileSync(file));
}

const escapeAttr = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// What VisualizationFrame.vue builds in the browser, rendered here instead: the same
// data-incoming, the same plugin href, so a built app resolves Pyodide the way it does
// in a deployment rather than from the dev server.
function hostPage(url) {
    const params = new URL(url, "http://127.0.0.1:8099").searchParams;
    const incoming = {
        root: "http://127.0.0.1:8099/",
        visualization_config: {
            dataset_id: params.get("dataset_id") || undefined,
            history_id: params.get("history_id") || undefined,
            settings: {},
        },
        visualization_plugin: pluginDict(),
        visualization_title: "AI Research Assistant",
    };
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
        return json(res, 200, { script });
    }
    // Drives that assert on what the model was sent need the record to start empty;
    // `/__script` deliberately keeps it, because a drive may switch scripts mid-turn.
    if (url.startsWith("/__forget")) {
        prompts.length = 0;
        return json(res, 200, { prompts: 0 });
    }
    if (url.startsWith("/__seen")) return json(res, 200, { seen, calls, prompts });

    if (url.startsWith(PLUGIN_HREF)) return serveStatic(res, url.slice(PLUGIN_HREF.length).split("?")[0]);
    if (url === "/" || url.startsWith(HOST_PAGE)) {
        res.writeHead(200, { "Content-Type": "text/html" });
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
        });
        // A summarization request is the one with no tools, whatever the scenario.
        const isSummarization = !prompts[prompts.length - 1].hasTools;
        if (isSummarization) {
            return json(res, 200, message("## Goal\nthe summarized goal"));
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
            return json(res, 200, message("recovered after the wait"));
        }
        if (script === "slow") {
            // Long enough that Stop lands while the request is in flight.
            await new Promise((r) => setTimeout(r, 60000));
            return json(res, 200, message("too late"));
        }
        if (script === "plan") {
            // A plan card, so the driver has an Approve button to click.
            return json(res, 200, message(
                "```plan\n## Plan A: Stub Plan [galaxy]\n\n" +
                "Draft used only to render an approvable card.\n\n### Steps\n\n" +
                "- [ ] 1. **Concatenate the inputs** -- join the two datasets\n" +
                "  - Routing: galaxy\n  - Tool: cat\n" +
                "  - Verification: confirm the output exists and is non-empty\n```",
            ));
        }
        if (script === "compact") {
            return json(res, 200, message("ok"));
        }
        if (script === "ops-bridge") {
            const msgs = body.messages || [];
            const tail = msgs[msgs.length - 1] || {};
            return json(res, 200, tail.role === "tool"
                ? message("operations answered")
                : message("", delegatedOps));
        }
        if (script === "python") {
            const msgs = body.messages || [];
            const tail = msgs[msgs.length - 1] || {};
            return json(res, 200, tail.role === "tool"
                ? message(`python returned ${tail.content}`)
                : message("", runPython));
        }
        // Keyed on the last message; by turn two the transcript always has a tool result.
        const messages = body.messages || [];
        const last = messages[messages.length - 1] || {};
        if (script === "two-artifacts") {
            const turns = messages.filter((m) => m.role === "user").length;
            return json(res, 200, last.role === "tool"
                ? message(`Chart ${turns} is open.`)
                : message("", showTitled(turns < 2 ? "First Chart" : "Second Chart")));
        }
        if (script === "visualization") {
            return json(res, 200, last.role === "tool"
                ? message("The structure is open in the viewer.")
                : message("", createVisualization));
        }
        return json(res, 200, last.role === "tool" ? message("Done.") : message("", deleteHistory));
    }

    // Everything else is Galaxy; record it so tests can assert on the PUT.
    seen.push(`${req.method} ${url}`);
    if (url.includes("/api/plugins/olit")) return json(res, 200, pluginDict());
    if (url.includes("/api/plugins")) return json(res, 200, [{ name: "ngl", settings: [], tracks: [] }]);
    if (url.includes("/api/datatypes/")) return json(res, 200, [{ visualization: "ngl" }]);
    if (url.includes("/api/datasets/")) {
        return json(res, 200, { id: "d1", name: "peptide.pdb", extension: "pdb" });
    }
    if (url.includes("/api/visualizations")) return json(res, 200, { id: "v1" });
    if (url.includes("/api/histories")) return json(res, 200, { id: "h1", name: "stub" });
    return json(res, 200, {});
});

server.listen(8099, () => console.log("stub on 8099"));
