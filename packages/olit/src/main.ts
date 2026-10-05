/** olit shell: mounts Orbit's ChatPanel, starts the agent worker, drives the chat. */
import "./orbit/styles.css";
import "./olit.css";
import { describeSeedDataset, summarize } from "./seed-dataset";
import { ChatPanel } from "./orbit/chat/chat-panel";
import { applyOrbitTheme } from "./orbit/theme";
import { parseIncoming } from "./incoming";
import { galaxyCanRun, galaxyRefusalMessage } from "./diagnostics";
import { buildConfig } from "./config";
import { ensureCredentials, switchProvider } from "./credentials-modal";
import { lastLine, renderMessages, replayMessages } from "./transcript";
import { SessionStore, galaxyUserId, indexedDbStore } from "./session";
import {
  advance,
  newDocument,
  noteModel,
  restoreMessages,
  type SessionDocument,
} from "./session-document";
import { reportSavedState, savedSessions } from "./saved-session";
import { createConfirm } from "./confirm-modal";
import { AgentClient } from "./agent/client";
import { connectGalaxy } from "./agent/galaxy";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { LoopEvent, SessionBinding } from "./agent/session";
import { paneArtifacts, renderArtifact, type Artifact } from "./artifacts";
import { WHAT, type Settled, type Watched } from "./agent/watch";
import { createFollowUpDelivery } from "./auto-resume";
import { mountLayout } from "./layout";
import { mountArtifactPane } from "./artifact-pane";
import { mountUsageBar } from "./usage-bar";
import { mountBuildStamp } from "./build-stamp";
import { createRetryNotice } from "./retry-notice";

const PLUGIN_NAME = "olit";
const MAX_INPUT_HEIGHT = 150;

const isDev = () => (import.meta as any).env.DEV;

/** A url the worker can use: resolved against the page. */
const absolute = (url: string) => new URL(url, document.baseURI).href;

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
  /** An info line as text: the vendored panel parses it as HTML, and dataset names, ids and
   * approval prompts reach it. */
  const info = (text: string) => {
    const line = chat.addInfoMessage("");
    line.textContent = text;
    return line;
  };
  const retryNotice = createRetryNotice({ addInfoMessage: info });

  // Ask for a provider/key before the worker starts.
  let creds = await ensureCredentials(container);
  const config = buildConfig(incoming, creds);
  const rootPath = new URL(config.galaxy_root, document.baseURI).pathname;
  // Runtime context: where relative fetches resolve and what origin Galaxy calls hit.
  console.log("[olit] context", {
    href: window.location.href,
    origin: window.location.origin,
    isIframe: window.top !== window.self,
    galaxy_root: config.galaxy_root,
  });

  const seed = { role: "system", content: "", timestamp: Date.now() } as AgentMessage;
  const convo: AgentMessage[] = [seed];
  // The shell owns what a turn produced, the way it owns the transcript: the agent session is
  // rebuilt whenever the config changes, so anything it held would not survive a model switch.
  const produced: Artifact[] = [];
  // A vega spec carries its rows, so a long session keeps only its most recent artifacts.
  const ARTIFACT_LIMIT = 20;

  const credentials = (process.env.credentials as RequestCredentials) || "include";
  // The page's own Galaxy requests take the transport the agent's do.
  const galaxy = connectGalaxy({ root: config.galaxy_root, credentials });
  const session = new SessionStore(indexedDbStore(), await galaxyUserId(galaxy));
  const saved = savedSessions(galaxy);
  // Opening a saved visualization opens that session. Otherwise IndexedDB continues the
  // last conversation in this history, which is reload convenience, not a second authority.
  const fromGalaxy = incoming.visualizationId
    ? await saved.load(incoming.visualizationId).catch(() => null)
    : null;
  let savedId = fromGalaxy ? incoming.visualizationId : undefined;
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
  config.session_started_at = sessionDoc.session.createdAt;

  const usage = mountUsageBar(container);
  mountBuildStamp(container, {
    commit: (process.env.olit_commit as string) || "",
    built: (process.env.olit_built as string) || "",
    galaxy: config.galaxy_root,
    provider: config.ai_provider,
    model: config.ai_model || "",
  });

  el.input.addEventListener("input", () => autosize(el.input));

  // Naming the active model makes a misconfigured run obvious.
  const showModel = () =>
    (el.model.textContent = creds.model ? `${creds.provider} · ${creds.model}` : creds.provider);
  showModel();
  el.model.addEventListener("click", async () => {
    const picked = await switchProvider(container);
    if (picked) {
      creds = picked;
      const { ai_base_url, ai_provider, ai_model } = buildConfig(incoming, picked);
      Object.assign(config, { ai_base_url, ai_provider, ai_model });
      showModel();
    }
  });

  // Saving is deliberate, as for any other Galaxy visualization: a revision then marks a
  // save the user asked for rather than a conversation turn.
  el.save.addEventListener("click", async () => {
    el.save.disabled = true;
    el.save.textContent = "Saving...";
    try {
      savedId = await saved.save(sessionDoc, savedId);
      el.save.textContent = "Saved";
      reportSavedState(true);
      info(
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
  const restored = restoreMessages(sessionDoc, seed);
  const resumed = restored.length > 1;
  if (resumed) {
    convo.length = 0;
    convo.push(...restored);
    replayMessages(chat, restored);
    el.reset.classList.remove("hidden");
  }
  if (fromGalaxy) {
    info("Opened a saved Olit session.");
  }
  // Replayed like the transcript: a resumed session that can still place a chart but shows
  // an empty pane is telling the user it lost something it did not.
  for (const artifact of paneArtifacts(produced)) {
    await renderArtifact(el.artifactContent, artifact, rootPath);
  }

  const base = isDev() ? "" : `static/plugins/visualizations/${PLUGIN_NAME}/`;
  const agent = new AgentClient(
    new URL(`${incoming.root}${base}static/pyodide`, window.location.href).href,
  );
  const ready = true;
  info(
    resumed
      ? "Resumed this history's conversation. Olit ready."
      : "Olit ready. Ask me to run something.",
  );
  // Its own message: being ready and having a dataset to start from are separate facts.
  if (config.dataset_id) {
    void describeSeedDataset(galaxy, config.dataset_id).then((found) => {
      if (found) {
        info(summarize(found));
      }
    });
  }

  /** What every request to the worker carries: the same config is the same session there. */
  function workerConfig() {
    return {
      ...config,
      ai_base_url: config.ai_base_url && absolute(config.ai_base_url),
      galaxy_root: absolute(config.galaxy_root),
      ai_api_key: creds.apiKey,
      credentials,
    };
  }

  function settledOne({ watched: w, state, outcome }: Settled) {
    const what = WHAT[w.kind];
    if (outcome === "failed") {
      chat.addErrorMessage(`${what} ${w.id} finished as ${state}.`);
    } else if (outcome === "cancelled") {
      // The user asked for this; an alarm about it would be the loudest thing in the room.
      info(`${what} ${w.id} was cancelled.`);
    } else {
      info(`${what} ${w.id} finished (${state}).`);
    }
  }

  // The session watches submitted work; the page only asks it, now and then, what settled.
  let polling: ReturnType<typeof setInterval> | undefined;
  let polled: Promise<void> | undefined;
  async function poll() {
    const {
      settled,
      pending,
      watching,
      followUp: prompt,
    } = await agent.settle({
      config: workerConfig(),
      watching: sessionDoc.watching ?? [],
    });
    settled.forEach(settledOne);
    sessionDoc.watching = watching;
    if (settled.length) {
      await session.save(sessionDoc);
    }
    // Continue without asking the user to relay the notification.
    if (prompt) {
      followUp.deliver(prompt);
    }
    if (!pending && polling) {
      clearInterval(polling);
      polling = undefined;
    }
  }
  function watchGalaxy() {
    polling ??= setInterval(() => {
      polled ??= poll().finally(() => (polled = undefined));
    }, 10_000);
  }

  // Work a reloaded page had open is still worth hearing about.
  if (sessionDoc.watching?.length) {
    watchGalaxy();
  }

  let busy = false;

  /** Saving mid-turn would store a half-finished turn, and an empty session has none. */
  function refreshSave() {
    el.save.disabled = busy || sessionDoc.session.turn === 0;
  }

  refreshSave();
  // Bounded automatic continuation, so an unattended tab cannot keep itself busy.
  const followUp = createFollowUpDelivery((text) => void runAutomaticTurn(text), {
    onPaused: (text) => info(text),
  });
  // Last diagnostics the agent reported; undefined until the first turn returns.
  let latest: import("./diagnostics").Diagnostics | undefined;

  // Whether streamed text is open in an assistant message.
  let speaking = false;

  /** What the agent session reports it is bound to; it owns these, the page records them. */
  function adopt(binding: SessionBinding) {
    if (binding.history_id) {
      sessionDoc.history_id = binding.history_id;
      config.history_id = binding.history_id;
    }
    sessionDoc.session.recordPageId = binding.record_page_id;
    config.record_page_id = binding.record_page_id;
  }

  /** Cards and text rendered live from loop events; the final reconcile skips these. */
  function liveEvents(streamed: Set<string>) {
    return (ev: LoopEvent) => {
      if (ev.type === "text") {
        chat.hideThinking();
        if (!speaking) {
          chat.startAssistantMessage();
          speaking = true;
        }
        chat.appendDelta(ev.delta);
        return;
      }
      if (speaking) {
        chat.finishAssistantMessage();
        speaking = false;
      }
      if (ev.type === "tool_start") {
        streamed.add(ev.id);
        chat.hideThinking();
        chat.addToolCard(ev.id, ev.name);
      } else if (ev.type === "llm_retry") {
        // A rate limit means a long silent wait; count it down instead.
        retryNotice.start(ev.status, ev.wait, ev.attempt, ev.of);
      } else if (ev.type === "compacted") {
        // Never let history disappear without saying so.
        info("Summarized the earlier conversation to make room.");
      } else if (ev.type === "context_overflow") {
        // Compaction was needed and could not help; say so before the provider does.
        chat.addErrorMessage(
          "This conversation no longer fits in the model's context window, and summarizing " +
            "cannot free enough room. Start a new conversation, or configure a larger window.",
        );
      } else if (ev.type === "tool_end") {
        chat.updateToolCard(ev.id, ev.is_error ? "error" : "done", ev.content);
        // The session registered and recorded what this call submitted; the page polls it.
        if (ev.watch) {
          watchGalaxy();
        }
        // The session says when a call moved it: a history the agent chose, a record it opened.
        if (ev.binding) {
          adopt(ev.binding);
        }
      }
    };
  }

  /** One turn: the request, what the agent said, and whatever it produced. */
  async function runTurn(text: string): Promise<void> {
    const streamed = new Set<string>();
    console.groupCollapsed("[olit] turn");
    console.log("request", {
      galaxy_root: config.galaxy_root,
      text,
    });
    const reply = await agent.run(
      {
        config: workerConfig(),
        transcripts: convo,
        artifacts: produced,
        watching: sessionDoc.watching ?? [],
      },
      liveEvents(streamed),
      confirm,
    );
    if (speaking) {
      chat.finishAssistantMessage();
      speaking = false;
    }
    console.log("diagnostics", reply.diagnostics);
    console.log("trace", reply.logs);
    console.log("messages", reply.messages);
    console.groupEnd();

    latest = reply.diagnostics || latest;
    chat.hideThinking();
    retryNotice.stop();
    // The agent names this turn's messages; compaction moves them, so no slicing.
    const spoke = renderMessages(chat, reply.new_messages || [], streamed, true);
    // Exactly one explanation for a quiet turn, most specific first.
    if (reply.error) {
      console.error("[olit] turn failed", reply.error);
      chat.addErrorMessage(lastLine(reply.error.message || "The turn failed."));
    } else if (reply.aborted) {
      info("Stopped.");
    } else if (reply.exhausted) {
      // Orbit has no step cap; olit's must not look like completion.
      info('I ran out of steps for one turn while still working. Say "continue" to pick it up.');
    } else if (!spoke && !reply.done) {
      // A reply with no tool calls ends the loop; `done` means finish was called.
      info("The model ended the turn without a reply. Ask again, or rephrase.");
    }

    convo.length = 0;
    convo.push(...(reply.messages || []));
    if (reply.binding) {
      adopt(reply.binding);
    }
    sessionDoc.watching = reply.watching ?? sessionDoc.watching;

    const artifacts = reply.artifacts || [];
    if (artifacts.length) {
      produced.push(...artifacts);
      produced.splice(0, produced.length - ARTIFACT_LIMIT);
      el.artifactContent.innerHTML = "";
      for (const a of artifacts) {
        await renderArtifact(el.artifactContent, a, rootPath);
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
    });
    noteModel(sessionDoc, { provider: config.ai_provider, model: config.ai_model });
    void session.save(sessionDoc);
    el.save.textContent = "Save";
    reportSavedState(false);
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
    convo.push({ role: "user", content: text, timestamp: Date.now() });
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
    info("Checking the Galaxy results that just landed.");
    chat.showThinking();
    convo.push({ role: "user", content: text, timestamp: Date.now() });
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
      agent.abort();
    }
  }

  const showConfirm = createConfirm({
    container,
    respond: (id, approved) => agent.confirm(Number(id), approved),
    note: (text) => info(text),
  });
  function confirm(id: number, request: { title: string; message: string }) {
    showConfirm(String(id), request);
  }

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
    // A new conversation is a new session with no record yet; the old record stays the old one's.
    config.session_id = sessionDoc.session.id;
    config.record_page_id = undefined;
    config.session_started_at = sessionDoc.session.createdAt;
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
    info(
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
      if (!galaxyCanRun(latest?.galaxy)) {
        chat.addErrorMessage(galaxyRefusalMessage());
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

// No window here: the agent compacts, and trimming on top would delete the summary.

void main();
