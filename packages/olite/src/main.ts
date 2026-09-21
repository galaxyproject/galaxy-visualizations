/** olite shell: mounts Orbit's ChatPanel, boots the Pyodide brain, drives the chat. */
import "./orbit/styles.css";
import "./olite.css";
import { editRecord } from "./record-write";
import { describeSeedDataset, summarize } from "./seed-dataset";
import { applyJobOutcome, noteSubmitted } from "./record-jobs";
import { ChatPanel } from "./orbit/chat/chat-panel";
import { applyOrbitTheme } from "./orbit/theme";
import { parseIncoming } from "./incoming";
import { catalogRefusalMessage, galaxyCanRun } from "./catalog-gate";
import { buildConfig } from "./config";
import { ensureCredentials, switchProvider } from "./credentials-modal";
import { describeError, lastLine, renderMessages, replayMessages, toolStatus } from "./transcript";
import { SessionMemory, galaxyUserId, indexedDbStore } from "./session";
import { writeSessionSummary } from "./session-summary";
import { createConfirm } from "./confirm-modal";
import { PyodideManager } from "./pyodide/pyodide-manager";
import { runOlite } from "./pyodide-runner";
import { renderArtifact } from "./artifacts";
import { InvocationWatcher, galaxyStateReader, isFailure } from "./invocations";
import { mountLayout } from "./layout";
import { mountArtifactPane } from "./artifact-pane";
import { mountUsageBar } from "./usage-bar";
import { createRetryNotice } from "./retry-notice";

const PLUGIN_NAME = "olite";
const PROMPT_DEFAULT = "You are OLite. Communicate only by calling tools.";
const MAX_INPUT_HEIGHT = 150;

const isDev = () => (import.meta as any).env.DEV;

/** Dev-only: synthesize data-incoming from the plugin XML (no framework host). */
async function seedDevIncoming(container: HTMLElement): Promise<void> {
    const { parseXML } = await import("galaxy-charts-xml-parser");
    const pageUrl = new URL(window.location.href);
    container.dataset.incoming = JSON.stringify({
        root: "/",
        visualization_config: {
            dataset_id: pageUrl.searchParams.get("dataset_id") || "__test__",
            // Dev only: a history to key the session on, as Galaxy supplies in production.
            history_id: pageUrl.searchParams.get("history_id") || undefined,
            settings: {},
        },
        visualization_plugin: await parseXML("olite.xml"),
    });
}

/** Grow the composer with its content, up to a few lines. */
function autosize(input: HTMLTextAreaElement): void {
    input.style.height = "auto";
    // scrollHeight excludes the border that border-box counts in height.
    const chrome = input.offsetHeight - input.clientHeight;
    const wanted = input.scrollHeight + chrome;
    input.style.height = Math.min(wanted, MAX_INPUT_HEIGHT) + "px";
    input.style.overflowY = wanted > MAX_INPUT_HEIGHT ? "auto" : "hidden";
}

async function main() {
    const scriptUrl = new URL(import.meta.url);
    const containerId = scriptUrl.searchParams.get("container") || "app";
    const container = document.getElementById(containerId)!;

    if (isDev()) {
        await seedDevIncoming(container);
    }

    const incoming = parseIncoming(container);
    applyOrbitTheme("light", document.documentElement);

    const el = mountLayout(container);
    const artifactPane = mountArtifactPane(container);
    const chat = new ChatPanel(el.messages);

    // Ask for a provider/key before the worker starts.
    const creds = await ensureCredentials(container);
    const config = buildConfig(incoming, creds);
    // Runtime context: where relative fetches resolve and what origin Galaxy calls hit.
    console.log("[olite] context", {
        href: window.location.href,
        origin: window.location.origin,
        isIframe: window.top !== window.self,
        galaxy_root: config.galaxy_root,
        openapi_url: `${config.galaxy_root}openapi.json`,
    });

    // One id per tab, so the summary block upserts rather than accumulating.
    const sessionId = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const seed = { role: "system", content: incoming.specs.ai_prompt || PROMPT_DEFAULT };
    const convo: Array<{ role: string; content: string }> = [seed];

    // One conversation per user and history, as pi keys a session by home plus directory.
    const credentials = (process.env.credentials as RequestCredentials) || "include";
    const session = new SessionMemory(
        indexedDbStore(),
        config.history_id,
        await galaxyUserId(config.galaxy_root, credentials),
    );

    const usage = mountUsageBar(container);
    const retryNotice = createRetryNotice(chat);

    el.input.addEventListener("input", () => autosize(el.input));

    // Naming the active model makes a misconfigured run obvious.
    el.model.textContent = creds.model ? `${creds.provider} · ${creds.model}` : creds.provider;
    el.model.addEventListener("click", () => void switchProvider(container));

    // Replay before the boot notice, so the restored turns sit above it as history.
    let resumed = false;
    const restored = session.enabled ? await session.load() : null;
    if (restored) {
        convo.length = 0;
        convo.push(...restored);
        replayMessages(chat, restored);
        resumed = true;
        el.reset.classList.remove("hidden");
    }

    // Boot Pyodide (brain lives inside it).
    const base = isDev() ? "" : `static/plugins/visualizations/${PLUGIN_NAME}/`;
    const indexURL = `${incoming.root}${base}static/pyodide`;
    const pyodide = new PyodideManager({
        indexURL,
        extraPackages: [`${indexURL}/${process.env.olite_wheel}`],
    });
    let ready = false;
    const readyInfo = chat.addInfoMessage("Loading OLite...");
    pyodide
        .initialize()
        .then(() => {
            ready = true;
            readyInfo.textContent = resumed
                ? "Resumed this history's conversation. OLite ready."
                : "OLite ready. Ask me to run something.";
            // Its own message, not a replacement: being ready and having a dataset to start
            // from are separate facts, and the user wants both.
            if (config.dataset_id) {
                void describeSeedDataset(config.galaxy_root, credentials, config.dataset_id).then(
                    (found) => {
                        if (found) {
                            chat.addInfoMessage(summarize(found));
                        }
                    },
                );
            }
        })
        .catch((e) => chat.addErrorMessage(`Failed to load OLite: ${e}`));

    // Advances submitted Galaxy work between turns, so no turn blocks on a job.
    const watcher = new InvocationWatcher({
        readState: galaxyStateReader(config.galaxy_root, credentials),
        // loom's agent calls galaxy_invocation_record so the poller owns the entry.
        onSubmitted: (w) => {
            if (!config.history_id) return;
            void editRecord(
                { root: config.galaxy_root, credentials, historyId: config.history_id },
                (content) => noteSubmitted(content, w),
            );
        },
        onSettled: (w, state) => {
            const what = w.kind === "invocation" ? "Workflow invocation" : "Galaxy job";
            const failed = isFailure(w.kind, state);
            if (failed) {
                chat.addErrorMessage(`${what} ${w.id} finished as ${state}.`);
            } else {
                chat.addInfoMessage(`${what} ${w.id} finished (${state}). Ask me to check the results.`);
            }
            // loom's poller advances the notebook itself.
            if (config.history_id) {
                void editRecord(
                    { root: config.galaxy_root, credentials, historyId: config.history_id },
                    (content) => applyJobOutcome(content, { id: w.id, kind: w.kind, state, failed }),
                );
            }
        },
    });

    let busy = false;
    // Last catalog status the brain reported; undefined until the first turn returns.
    let latestCatalog: import("./catalog-gate").CatalogStatus | undefined;

    /** Cards rendered live from loop events; the final reconcile skips these ids. */
    function liveEvents(streamed: Set<string>) {
        return (ev: any) => {
            if (ev.type === "tool_start") {
                streamed.add(ev.id);
                chat.hideThinking();
                chat.addToolCard(ev.id, ev.name || "tool");
            } else if (ev.type === "llm_retry") {
                // A rate limit means a long silent wait; count it down instead.
                retryNotice.start(ev.status, ev.wait, ev.attempt, ev.of);
            } else if (ev.type === "compacted") {
                // Never let history disappear without saying so.
                chat.addInfoMessage("Summarized the earlier conversation to make room.");
            } else if (ev.type === "context_overflow") {
                // Compaction was needed and could not help; say so before the provider does.
                chat.addErrorMessage(
                    "This conversation no longer fits in the model's context window, and summarizing " +
                        "cannot free enough room. Start a new conversation, or configure a larger window.",
                );
            } else if (ev.type === "tool_end") {
                // The brain states the outcome; toolStatus only guesses at it.
                const status = ev.is_error ? "error" : toolStatus(ev.content || "");
                chat.updateToolCard(ev.id, status, ev.content || "");
                // Galaxy returns the ids, so the model never has to register them.
                watcher.ingest(ev.name || "", ev.content || "");
            }
        };
    }

    /** One turn: the request, what the brain said, and whatever it produced. */
    async function runTurn(text: string): Promise<void> {
        const streamed = new Set<string>();
        console.groupCollapsed("[olite] turn");
        console.log("request", {
            galaxy_root: config.galaxy_root,
            capabilities: config.capabilities,
            text,
        });
        const reply = await runOlite(pyodide, config, convo, liveEvents(streamed));
        console.log("diagnostics", reply.diagnostics);
        console.log("trace", reply.logs);
        console.log("messages", reply.messages);
        console.groupEnd();

        // Surface a broken Galaxy catalog once; it is otherwise a silent dead end.
        const cat = reply.diagnostics && reply.diagnostics.catalog;
        latestCatalog = cat || latestCatalog;
        if (cat && !cat.loaded) {
            chat.addErrorMessage(
                `Galaxy catalog did not load (root=${config.galaxy_root}): ${cat.error}`,
            );
        }
        chat.hideThinking();
        retryNotice.stop();
        if (reply.error) {
            // The brain returns a failed turn as data; the console keeps the detail.
            console.error("[olite] turn failed", reply.error);
            chat.addErrorMessage(describeError(reply.error));
            return;
        }

        // The brain names this turn's messages; compaction moves them, so no slicing.
        const spoke = renderMessages(chat, reply.new_messages || [], streamed);
        // Exactly one explanation for a quiet turn, most specific first.
        if (reply.aborted) {
            chat.addInfoMessage("Stopped.");
        } else if (reply.exhausted) {
            // Orbit has no step cap; olite's must not look like completion.
            chat.addInfoMessage(
                'I ran out of steps for one turn while still working. Say "continue" to pick it up.',
            );
        } else if (!spoke && !reply.done) {
            // A reply with no tool calls ends the loop; `done` means finish was called.
            chat.addInfoMessage("The model ended the turn without a reply. Ask again, or rephrase.");
        }

        convo.length = 0;
        convo.push(...(reply.messages || []));
        void session.save(convo);
        // loom writes a session block into the notebook itself.
        void writeSessionSummary(config.galaxy_root, credentials, config.history_id, {
            id: sessionId,
            startedAt,
            endedAt: new Date().toISOString(),
            orphanedActiveSteps: 0,
        });
        el.reset.classList.toggle("hidden", !session.enabled);
        usage.add(reply.usage);

        const artifacts = reply.artifacts || [];
        if (artifacts.length) {
            artifactPane.reveal();
            el.artifactContent.innerHTML = "";
            for (const a of artifacts) {
                await renderArtifact(el.artifactContent, a);
            }
        }
    }

    async function submit() {
        const text = el.input.value.trim();
        if (!text || busy || !ready) {
            return;
        }
        busy = true;
        el.input.value = "";
        el.input.style.height = "auto";
        // Stop replaces Send for the duration of the turn, as in Orbit.
        el.send.classList.add("hidden");
        el.abort.classList.remove("hidden");
        chat.addUserMessage(text);
        chat.showThinking();
        convo.push({ role: "user", content: text });
        try {
            await runTurn(text);
        } catch (e) {
            chat.hideThinking();
            retryNotice.stop();
            chat.addErrorMessage(lastLine(String(e)));
        } finally {
            // One place the composer comes back, whichever way the turn ended.
            el.abort.classList.add("hidden");
            el.send.classList.remove("hidden");
            busy = false;
        }
    }

    function abortCurrentTurn() {
        if (busy) {
            pyodide.abort();
        }
    }

    pyodide.onConfirm = createConfirm({
        container,
        respond: (id, approved) => pyodide.respondToConfirm(id, approved),
        note: (text) => chat.addInfoMessage(text),
    });

    el.send.addEventListener("click", submit);
    el.abort.addEventListener("click", abortCurrentTurn);
    // loom: "reset session -- fresh start, no --continue".
    el.reset.addEventListener("click", async () => {
        if (busy) {
            return;
        }
        await session.clear();
        convo.length = 0;
        convo.push(seed);
        el.messages.innerHTML = "";
        el.reset.classList.add("hidden");
        chat.addInfoMessage("Started a new conversation. The record on Galaxy is untouched.");
    });
    el.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
        }
    });
    // Esc stops the turn; bound on the container because olite lives in an iframe.
    container.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Escape" && busy) {
            abortCurrentTurn();
        }
    });

    // Approve / Edit / Reject on a plan draft card; wording follows loom's handler.
    el.messages.addEventListener("plan-draft-action", (e) => {
        const { action, body } = (e as CustomEvent<{ action: string; body: string }>).detail;
        if (action === "approve") {
            // loom's init gate refuses /execute when Galaxy cannot run the plan.
            if (!galaxyCanRun(latestCatalog)) {
                chat.addErrorMessage(catalogRefusalMessage(latestCatalog));
                return;
            }
            el.input.value =
                "I approve the plan above. Show the full parameter table for review before executing.";
            void submit();
        } else if (action === "reject") {
            el.input.value = "Reject the plan above — let's rethink it.";
            void submit();
        } else if (action === "edit") {
            // Edit hands the draft back for the user to change; it does not submit.
            el.input.value =
                "Here is the plan with my edits — please revise your draft accordingly:\n\n```plan\n" +
                body +
                "\n```";
            el.input.focus();
            // Setting .value does not raise `input`, so the box would stay one line tall.
            el.input.dispatchEvent(new Event("input"));
        }
    });
}

// No window here: the brain compacts, and trimming on top would delete the summary.

void main();
