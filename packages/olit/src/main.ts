/** olit shell: mounts Orbit's ChatPanel, boots the Pyodide brain, drives the chat. */
import "./orbit/styles.css";
import "./olit.css";
import { editRecord } from "./record-write";
import { describeSeedDataset, summarize } from "./seed-dataset";
import { WHAT, applyJobOutcome, noteSubmitted } from "./record-jobs";
import { ChatPanel } from "./orbit/chat/chat-panel";
import { applyOrbitTheme } from "./orbit/theme";
import { parseIncoming } from "./incoming";
import { catalogRefusalMessage, galaxyCanRun } from "./catalog-gate";
import { buildConfig } from "./config";
import { ensureCredentials, switchProvider } from "./credentials-modal";
import { describeError, lastLine, renderMessages, replayMessages, toolStatus } from "./transcript";
import { SessionStore, galaxyUserId, indexedDbStore } from "./session";
import {
  advance,
  newDocument,
  noteModel,
  restoreMessages,
  type SessionDocument,
} from "./session-document";
import { reportSavedState, savedSessions } from "./saved-session";
import { writeSessionSummary } from "./session-summary";
import { historyFromResult, recordPageFromResult } from "./working-history";
import { createConfirm } from "./confirm-modal";
import { PyodideManager } from "./pyodide/pyodide-manager";
import { runOlit, type LoopEvent, type Message } from "./pyodide-runner";
import { paneArtifacts, renderArtifact, type Artifact } from "./artifacts";
import { InvocationWatcher, galaxyStateReader, isFailure } from "./invocations";
import { buildResumePrompt, createFollowUpDelivery, isResumableOutcome } from "./auto-resume";
import { mountLayout } from "./layout";
import { mountArtifactPane } from "./artifact-pane";
import { mountUsageBar } from "./usage-bar";
import { mountBuildStamp } from "./build-stamp";
import { createRetryNotice } from "./retry-notice";

const PLUGIN_NAME = "olit";
const PROMPT_DEFAULT = "You are Olit. Communicate only by calling tools.";
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
    visualization_plugin: await parseXML("olit.xml"),
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
  console.log("[olit] context", {
    href: window.location.href,
    origin: window.location.origin,
    isIframe: window.top !== window.self,
    galaxy_root: config.galaxy_root,
    openapi_url: `${config.galaxy_root}openapi.json`,
  });

  // Regenerated from the plugin XML every load, so a prompt correction reaches a resumed
  // conversation instead of being pinned to the text of the day it started.
  const seed = { role: "system", content: incoming.specs.ai_prompt || PROMPT_DEFAULT };
  const convo: Message[] = [seed];
  // The shell owns what a turn produced, the way it owns the transcript: the brain is
  // rebuilt whenever the config changes, so anything it held would not survive a model switch.
  const produced: Artifact[] = [];
  // A vega spec carries its rows, so a long session keeps only its most recent artifacts.
  const ARTIFACT_LIMIT = 20;

  const credentials = (process.env.credentials as RequestCredentials) || "include";
  const session = new SessionStore(
    indexedDbStore(),
    await galaxyUserId(config.galaxy_root, credentials),
  );
  const saved = savedSessions(config.galaxy_root, credentials);
  // Opening a saved visualization opens that session. Otherwise IndexedDB continues the
  // last conversation in this history, which is reload convenience, not a second authority.
  let savedId = incoming.visualizationId;
  const fromGalaxy = savedId ? await saved.load(savedId).catch(() => null) : null;
  const localId = await session.current(config.history_id);
  const fromBrowser = !fromGalaxy && localId ? await session.load(localId) : null;
  // A history is a workspace, not a conversation: several sessions can run against one.
  let sessionDoc: SessionDocument =
    fromGalaxy ||
    fromBrowser ||
    newDocument({ historyId: config.history_id, datasetId: config.dataset_id });
  // A restored session names the history it operated in; the url need not repeat it.
  config.history_id = config.history_id || sessionDoc.history_id;
  // The record page is named, never discovered: the session owns one and says which.
  config.session_id = sessionDoc.session.id;
  config.record_page_id = sessionDoc.session.recordPageId;

  const usage = mountUsageBar(container);
  mountBuildStamp(container, {
    commit: (process.env.olit_commit as string) || "",
    built: (process.env.olit_built as string) || "",
    wheel: (process.env.olit_wheel as string) || "",
    galaxy: config.galaxy_root,
    provider: config.ai_provider,
    model: config.ai_model || "",
  });
  const retryNotice = createRetryNotice(chat);

  el.input.addEventListener("input", () => autosize(el.input));

  // Naming the active model makes a misconfigured run obvious.
  el.model.textContent = creds.model ? `${creds.provider} · ${creds.model}` : creds.provider;
  el.model.addEventListener("click", () => void switchProvider(container));

  // Saving is deliberate, as for any other Galaxy visualization: a revision then marks a
  // save the user asked for rather than a conversation turn.
  el.save.addEventListener("click", async () => {
    el.save.disabled = true;
    el.save.textContent = "Saving...";
    try {
      savedId = await saved.save(sessionDoc, savedId);
      el.save.textContent = "Saved";
      reportSavedState(true);
      chat.addInfoMessage(
        "Saved this conversation. Open it again from Galaxy's visualizations to continue it anywhere.",
      );
    } catch (e) {
      // The conversation itself is untouched; only the save failed.
      console.error("[olit] could not save the session", e);
      el.save.textContent = "Save";
      chat.addErrorMessage(`Could not save this conversation: ${lastLine(String(e))}`);
    } finally {
      refreshSave();
    }
  });

  // Replay before the boot notice, so the restored turns sit above it as history.
  // Switching provider reloads, so what earlier turns produced comes back from storage
  // rather than from memory: without this a chart cannot be placed after a model switch.
  produced.push(...sessionDoc.artifacts);
  // A restored session renders a failed step the way the live one did.
  const toolErrors = new Set<string>(sessionDoc.toolErrors || []);
  const restored = restoreMessages(sessionDoc, seed);
  const resumed = restored.length > 1;
  if (resumed) {
    convo.length = 0;
    convo.push(...restored);
    replayMessages(chat, restored, toolErrors);
    el.reset.classList.remove("hidden");
  }
  if (fromGalaxy) {
    chat.addInfoMessage("Opened a saved Olit session.");
  }
  // Replayed like the transcript: a resumed session that can still place a chart but shows
  // an empty pane is telling the user it lost something it did not.
  for (const artifact of paneArtifacts(produced)) {
    await renderArtifact(el.artifactContent, artifact);
  }

  // Boot Pyodide (brain lives inside it).
  const base = isDev() ? "" : `static/plugins/visualizations/${PLUGIN_NAME}/`;
  const indexURL = `${incoming.root}${base}static/pyodide`;
  const pyodide = new PyodideManager({
    indexURL,
    extraPackages: [`${indexURL}/${process.env.olit_wheel}`],
    // The key is the worker's to hold; the brain's config never carries it.
    llm: { baseUrl: config.ai_base_url, apiKey: creds.apiKey },
    galaxy: { root: config.galaxy_root, credentials },
    opsModule: process.env.ops_module as string,
  });
  let ready = false;
  const readyInfo = chat.addInfoMessage("Loading Olit...");
  pyodide
    .initialize()
    .then(() => {
      ready = true;
      readyInfo.textContent = resumed
        ? "Resumed this history's conversation. Olit ready."
        : "Olit ready. Ask me to run something.";
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
    .catch((e) => chat.addErrorMessage(`Failed to load Olit: ${e}`));

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
      const what = WHAT[w.kind];
      const failed = isFailure(w.kind, state);
      if (failed) {
        chat.addErrorMessage(`${what} ${w.id} finished as ${state}.`);
      } else {
        chat.addInfoMessage(`${what} ${w.id} finished (${state}).`);
      }
      // Continue without asking the user to relay the notification.
      if (isResumableOutcome(state, failed)) {
        followUp.deliver(
          buildResumePrompt([
            {
              kind: w.kind,
              id: w.id,
              label: `${what} ${w.id}`,
              outcome: failed ? "failed" : "completed",
            },
          ]),
        );
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

  /** Saving mid-turn would store a half-finished turn, and an empty session has none. */
  function refreshSave() {
    el.save.disabled = busy || sessionDoc.session.turn === 0;
  }

  refreshSave();
  // Bounded automatic continuation, so an unattended tab cannot keep itself busy.
  const followUp = createFollowUpDelivery((text) => void runAutomaticTurn(text), {
    onPaused: (text) => chat.addInfoMessage(text),
  });
  // Last catalog status the brain reported; undefined until the first turn returns.
  let latestCatalog: import("./catalog-gate").CatalogStatus | undefined;

  /** Cards rendered live from loop events; the final reconcile skips these ids. */
  function liveEvents(streamed: Set<string>) {
    return (ev: LoopEvent) => {
      if (ev.type === "tool_start") {
        streamed.add(ev.id);
        chat.hideThinking();
        chat.addToolCard(ev.id, ev.name);
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
        const status = ev.is_error ? "error" : toolStatus(ev.content);
        if (ev.is_error) {
          toolErrors.add(ev.id);
        }
        chat.updateToolCard(ev.id, status, ev.content);
        // Galaxy returns the ids, so the model never has to register them.
        watcher.ingest(ev.name, ev.content);
        // A session opened without a history still ends up in one the agent chose.
        const worked = historyFromResult(ev.name, ev.content);
        if (worked) {
          sessionDoc.history_id = worked;
          config.history_id = worked;
        }
        // A record page the brain created or replaced; the session owns it from here.
        const page = recordPageFromResult(ev.name, ev.content);
        if (page) {
          sessionDoc.session.recordPageId = page;
          config.record_page_id = page;
        }
      }
    };
  }

  /** One turn: the request, what the brain said, and whatever it produced. */
  async function runTurn(text: string): Promise<void> {
    const streamed = new Set<string>();
    console.groupCollapsed("[olit] turn");
    console.log("request", {
      galaxy_root: config.galaxy_root,
      text,
    });
    const reply = await runOlit(pyodide, {
      config,
      transcripts: convo,
      artifacts: produced,
      onEvent: liveEvents(streamed),
    });
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
      console.error("[olit] turn failed", reply.error);
      chat.addErrorMessage(describeError(reply.error));
      return;
    }

    // The brain names this turn's messages; compaction moves them, so no slicing.
    const spoke = renderMessages(chat, reply.new_messages || [], streamed);
    // Exactly one explanation for a quiet turn, most specific first.
    if (reply.aborted) {
      chat.addInfoMessage("Stopped.");
    } else if (reply.exhausted) {
      // Orbit has no step cap; olit's must not look like completion.
      chat.addInfoMessage(
        'I ran out of steps for one turn while still working. Say "continue" to pick it up.',
      );
    } else if (!spoke && !reply.done) {
      // A reply with no tool calls ends the loop; `done` means finish was called.
      chat.addInfoMessage("The model ended the turn without a reply. Ask again, or rephrase.");
    }

    convo.length = 0;
    convo.push(...(reply.messages || []));

    const artifacts = reply.artifacts || [];
    if (artifacts.length) {
      produced.push(...artifacts);
      produced.splice(0, produced.length - ARTIFACT_LIMIT);
      el.artifactContent.innerHTML = "";
      for (const a of artifacts) {
        await renderArtifact(el.artifactContent, a);
      }
      // After filling, so the pane opens on something rather than on an empty frame.
      artifactPane.reveal();
    }

    // One document, two stores: local now because it is cheap, Galaxy on a debounce
    // because every config change there inserts a whole new revision.
    sessionDoc = advance(sessionDoc, {
      messages: convo,
      artifacts: produced,
      usage: reply.usage,
      toolErrors,
    });
    noteModel(sessionDoc, { provider: config.ai_provider, model: config.ai_model });
    void session.save(sessionDoc);
    el.save.textContent = "Save";
    reportSavedState(false);
    // loom writes a session block into the notebook itself. The id is the persisted
    // session's, so a reload updates its block instead of appending another.
    void writeSessionSummary(config.galaxy_root, credentials, config.history_id, {
      id: sessionDoc.session.id,
      startedAt: sessionDoc.session.createdAt,
      endedAt: new Date().toISOString(),
      orphanedActiveSteps: 0,
    });
    el.reset.classList.toggle("hidden", !session.enabled);
    usage.add(reply.usage);
  }

  async function submit() {
    const text = el.input.value.trim();
    if (!text || busy || !ready) {
      return;
    }
    followUp.userInput();
    busy = true;
    refreshSave();
    el.input.value = "";
    el.input.style.height = "auto";
    // Stop replaces Send for the duration of the turn, as in Orbit.
    el.send.classList.add("hidden");
    el.abort.classList.remove("hidden");
    followUp.agentStarted();
    chat.addUserMessage(text);
    chat.showThinking();
    convo.push({ role: "user", content: text });
    try {
      await runTurn(text);
    } catch (e) {
      console.error("[olit] turn failed", e);
      chat.hideThinking();
      retryNotice.stop();
      chat.addErrorMessage(lastLine(String(e)));
    } finally {
      // One place the composer comes back, whichever way the turn ended.
      el.abort.classList.add("hidden");
      el.send.classList.remove("hidden");
      busy = false;
      refreshSave();
      followUp.agentSettled();
    }
  }

  /** A turn the poller started. The prompt reaches the model; the chat shows a line. */
  async function runAutomaticTurn(text: string) {
    if (busy || !ready) {
      return;
    }
    busy = true;
    refreshSave();
    followUp.agentStarted();
    el.send.classList.add("hidden");
    el.abort.classList.remove("hidden");
    chat.addInfoMessage("Checking the Galaxy results that just landed.");
    chat.showThinking();
    convo.push({ role: "user", content: text });
    try {
      await runTurn(text);
    } catch (e) {
      console.error("[olit] automatic follow-up failed", e);
      chat.hideThinking();
      retryNotice.stop();
      chat.addErrorMessage(lastLine(String(e)));
    } finally {
      el.abort.classList.add("hidden");
      el.send.classList.remove("hidden");
      busy = false;
      refreshSave();
      followUp.agentSettled();
    }
  }

  function abortCurrentTurn() {
    // Stop pauses automatic continuation until the user speaks again.
    followUp.aborted();
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
    // Reset starts a new conversation; it does not delete the old one. A session that was
    // saved stays saved, which is the point of a session having an identity of its own
    // rather than being whatever happens to be attached to the history.
    sessionDoc = newDocument({ historyId: config.history_id, datasetId: config.dataset_id });
    savedId = undefined;
    reportSavedState(true);
    await session.save(sessionDoc);
    convo.length = 0;
    convo.push(seed);
    el.messages.innerHTML = "";
    // The previous conversation's chart belongs to it, not to the new one.
    produced.length = 0;
    el.artifactContent.innerHTML = "";
    el.reset.classList.add("hidden");
    chat.addInfoMessage(
      "Started a new conversation. The previous one is saved, and the record on Galaxy is untouched.",
    );
  });
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  });
  // Esc stops the turn; bound on the container because olit lives in an iframe.
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
