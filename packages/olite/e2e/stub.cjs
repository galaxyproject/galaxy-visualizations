// Stands in for the provider and Galaxy; scripted per scenario via /__script.
const http = require("http");

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

const createVisualization = [{
    id: "call_1",
    type: "function",
    function: {
        name: "show_visualization",
        arguments: JSON.stringify({ dataset_id: "d1", visualization: "ngl" }),
    },
}];

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
        // Keyed on the last message; by turn two the transcript always has a tool result.
        const messages = body.messages || [];
        const last = messages[messages.length - 1] || {};
        if (script === "visualization") {
            return json(res, 200, last.role === "tool"
                ? message("The structure is open in the viewer.")
                : message("", createVisualization));
        }
        return json(res, 200, last.role === "tool" ? message("Done.") : message("", deleteHistory));
    }

    // Everything else is Galaxy; record it so tests can assert on the PUT.
    seen.push(`${req.method} ${url}`);
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
