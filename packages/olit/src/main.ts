/** olit shell: mounts Orbit's ChatPanel, starts the agent worker, drives the chat. */
import "./orbit/app/src/renderer/styles.css";
import "./olit.css";
import { settlePlanDrafts } from "./plan-drafts";
import { resolveLaunch, summarize } from "./seed-dataset";
import { ChatPanel } from "./orbit/app/src/renderer/chat/chat-panel";
import { applyOrbitTheme } from "./orbit/app/src/renderer/theme";
import { parseIncoming } from "./incoming";
import { galaxyCanRun, galaxyRefusalMessage } from "./diagnostics";
import { buildConfig } from "./config";
import { saveCredentials } from "./credentials";
import { ensureCredentials, switchProvider } from "./credentials-modal";
import { ChatView, lastLine, type RunOutcome } from "./transcript";
import { reportSavedState, savedSessions } from "./saved-session";
import { createConfirm } from "./confirm-modal";
import { AgentClient } from "./agent/client";
import { connectGalaxy } from "./agent/galaxy";
import type { GalaxyStatus } from "./agent/prompt";
import { WHAT } from "./agent/markers";
import type { Settled } from "./agent/watch";
import { paneArtifacts, renderArtifact, type Artifact } from "./artifacts";
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
  chat.setGalaxyServerUrl(absolute(config.galaxy_root));
  // Runtime context: where relative fetches resolve and what origin Galaxy calls hit.
  console.log("[olit] context", {
    href: window.location.href,
    origin: window.location.origin,
    isIframe: window.top !== window.self,
    galaxy_root: config.galaxy_root,
  });

  const credentials = (process.env.credentials as RequestCredentials) || "include";
  // The page's own Galaxy requests take the transport the agent's do.
  const galaxy = connectGalaxy({ root: config.galaxy_root, credentials });
  const saved = savedSessions(galaxy);
  // Opening a saved visualization opens that conversation; otherwise the history's own.
  let savedProblem: string | undefined;
  const fromGalaxy = incoming.visualizationId
    ? await saved.load(incoming.visualizationId).then(
        (document) => {
          if (!document) savedProblem = "it is not an Olit session this version can open";
          return document;
        },
        (e) => {
          savedProblem = String((e as Error)?.message ?? e);
          return null;
        },
      )
    : null;
  let savedId = fromGalaxy ? incoming.visualizationId : undefined;
  // A saved session carries its own history; otherwise the launch decides it.
  const launch = fromGalaxy ? {} : await resolveLaunch(galaxy, config.dataset_id);

  const usage = mountUsageBar(container);
  mountBuildStamp(container, {
    commit: (process.env.olit_commit as string) || "",
    built: (process.env.olit_built as string) || "",
    galaxy: config.galaxy_root,
    provider: config.ai_provider,
    model: config.ai_model || "",
  });

  el.input.addEventListener("input", () => autosize(el.input));

  let busy = false;
  let ready = false;
  /** Said once the new conversation is on screen, which clears the old one. */
  let afterReset: string | undefined;
  let galaxyStatus: GalaxyStatus | undefined;

  /** Stop replaces Send for the duration of a run, as in Orbit. */
  function setBusy(running: boolean) {
    busy = running;
    el.send.classList.toggle("hidden", running);
    el.abort.classList.toggle("hidden", !running);
    if (!running) retryNotice.stop();
    refreshSave();
  }

  /** Exactly one explanation for a quiet ending, most specific first. */
  function ended(outcome: RunOutcome) {
    if (outcome.error) {
      console.error("[olit] run failed", outcome.error);
      chat.addErrorMessage(lastLine(outcome.error));
    } else if (outcome.aborted) {
      info("Stopped.");
    } else if (outcome.exhausted) {
      // Orbit has no step cap; olit's must not look like completion.
      info('I ran out of steps for one turn while still working. Say "continue" to pick it up.');
    } else if (!outcome.spoke && !outcome.done) {
      info("The model ended the turn without a reply. Ask again, or rephrase.");
    }
    el.save.textContent = "Save";
    reportSavedState(false);
    refreshSave();
  }

  /**
   * On open, the newest artifacts: a conversation that can still place a chart but shows an empty
   * pane is telling the user it lost something it did not. Live, only what a result just made.
   */
  async function showArtifacts(artifacts: Artifact[], restored: boolean) {
    if (!artifacts.length) return;
    el.artifactContent.innerHTML = "";
    for (const artifact of restored ? paneArtifacts(artifacts) : artifacts) {
      await renderArtifact(el.artifactContent, artifact, rootPath, galaxy);
    }
    // After filling, so the pane opens on something rather than on an empty frame.
    if (!restored) artifactPane.reveal();
  }

  const view = new ChatView(chat, {
    info,
    busy: setBusy,
    artifacts: (artifacts, restored) => void showArtifacts(artifacts, restored),
    ended,
    usage: (totals) => usage.set(totals),
    retry: (errorMessage, at, attempt) => retryNotice.start(errorMessage, at, attempt),
    failed: (message) => chat.addErrorMessage(message),
    wrote: () => settlePlanDrafts(el.messages),
    retried: () => retryNotice.stop(),
  });

  /** Saving mid-run would store a half-finished run, and an empty conversation has none. */
  function refreshSave() {
    el.save.disabled = busy || !ready || view.turns === 0;
    el.reset.classList.toggle("hidden", view.turns === 0);
  }

  // Naming the active model makes a misconfigured run obvious.
  const showModel = () =>
    (el.model.textContent = creds.model ? `${creds.provider} · ${creds.model}` : creds.provider);
  showModel();

  /** What the worker runs on: urls resolved against the page, and the key. */
  function workerConfig() {
    return {
      ...config,
      ai_base_url: config.ai_base_url && absolute(config.ai_base_url),
      galaxy_root: absolute(config.galaxy_root),
      ai_api_key: creds.apiKey,
      credentials,
    };
  }

  function settledOne({ watched: w, state, outcome, record }: Settled) {
    const what = WHAT[w.kind];
    if (record) {
      chat.addErrorMessage(`The record was not updated for ${what} ${w.id}: ${record}.`);
    }
    if (outcome === "failed") {
      chat.addErrorMessage(`${what} ${w.id} finished as ${state}.`);
    } else if (outcome === "paused") {
      chat.addErrorMessage(`${what} ${w.id} is paused: it waits on an input that failed.`);
    } else if (outcome === "unreadable") {
      chat.addErrorMessage(`${what} ${w.id} is no longer shown by Galaxy (${state}).`);
    } else if (outcome === "cancelled" || outcome === "skipped") {
      // Someone chose this; an alarm about it would be the loudest thing in the room.
      info(`${what} ${w.id} was ${outcome}.`);
    } else {
      info(`${what} ${w.id} finished (${state}).`);
    }
  }

  const base = isDev() ? "" : `static/plugins/visualizations/${PLUGIN_NAME}/`;
  const opening = {
    pyodideURL: new URL(`${incoming.root}${base}static/pyodide`, document.baseURI).href,
    config: workerConfig(),
    placement: { historyId: launch.historyId, datasetId: config.dataset_id },
    ...(fromGalaxy && savedId ? { saved: { id: savedId, document: fromGalaxy } } : {}),
  };

  const showConfirm = createConfirm({
    container,
    respond: (id, approved) => agent.confirm(Number(id), approved),
    note: (text) => info(text),
  });

  const agent = new AgentClient((message) => {
    if (message.type === "events") {
      view.apply(message.events);
      if (afterReset && message.events.some((e) => e.type === "snapshot")) {
        info(afterReset);
        afterReset = undefined;
      }
      refreshSave();
    } else if (message.type === "settled") {
      settledOne(message.settled);
    } else if (message.type === "held") {
      if (message.held) {
        info(
          message.held === "stopped"
            ? "Galaxy results are waiting -- automatic follow-up is paused since you stopped. Say continue when you're ready."
            : "Galaxy results are waiting -- automatic follow-up paused after several automatic turns. Say continue to resume.",
        );
      }
    } else if (message.type === "confirm") {
      showConfirm(String(message.id), message);
    } else if (message.type === "ready") {
      ready = true;
      galaxyStatus = message.galaxy;
      refreshSave();
      if (message.unkept) {
        chat.addErrorMessage(
          `Olit is not keeping this conversation in the browser (${message.unkept}), so it ` +
            "ends when the page closes. Save it to Galaxy to keep it.",
        );
      }
      if (message.galaxyProblem) {
        chat.addErrorMessage(
          `Galaxy did not answer when Olit opened (${message.galaxyProblem}), so no Galaxy tool ` +
            "can run in this session. Reload once Galaxy is back.",
        );
      }
      if (message.recordsProblem) {
        chat.addErrorMessage(
          `Could not look for earlier Olit sessions on this history (${message.recordsProblem}), ` +
            "so this is a new session.",
        );
      }
      if (savedProblem) {
        chat.addErrorMessage(
          `Could not open saved session ${incoming.visualizationId} (${savedProblem}). This is ` +
            "the history's own conversation instead, and Save stores it as a new session.",
        );
      }
      if (fromGalaxy) {
        info("Opened a saved Olit session.");
      }
      info(
        fromGalaxy
          ? "Olit ready."
          : view.turns
            ? "Resumed this history's conversation. Olit ready."
            : "Olit ready. Ask me to run something.",
      );
      // Its own message: being ready and having a dataset to start from are separate facts.
      if (launch.problem) {
        const what = config.dataset_id ? `dataset ${config.dataset_id}` : "the current history";
        chat.addErrorMessage(
          `Could not read ${what} from Galaxy (${launch.problem}), so this conversation is not ` +
            "bound to a history.",
        );
      } else if (launch.dataset) {
        info(summarize(launch.dataset));
      }
    } else if (message.type === "recoverable") {
      // The browser kept nothing of a session here; the user says which, if any, this is.
      const line = info("Olit has earlier sessions on this history. Continue one, or start new: ");
      const choose = (pageId?: string) => {
        line.querySelectorAll("button").forEach((b) => (b.disabled = true));
        agent.recover(pageId);
      };
      for (const record of message.records) {
        const button = document.createElement("button");
        button.className = "plan-btn";
        button.textContent = `Continue ${record.title} (updated ${record.updated.slice(0, 16).replace("T", " ")})`;
        button.addEventListener("click", () => choose(record.pageId));
        line.append(button);
      }
      const fresh = document.createElement("button");
      fresh.className = "plan-btn";
      fresh.textContent = "Start new";
      fresh.addEventListener("click", () => choose());
      line.append(fresh);
    } else if (message.type === "waiting") {
      const line = info("Olit is open in another tab. ");
      const take = document.createElement("button");
      take.className = "plan-btn";
      take.textContent = "Use it here";
      take.addEventListener("click", () => {
        take.disabled = true;
        agent.open({ ...opening, steal: true });
      });
      line.append(take);
    } else if (message.type === "lost") {
      ready = false;
      el.input.disabled = true;
      el.send.disabled = true;
      refreshSave();
      chat.addErrorMessage("Olit was opened in another tab, which has it now.");
    } else if (message.type === "failed") {
      console.error("[olit] worker failed", message.message);
      chat.hideThinking();
      setBusy(false);
      chat.addErrorMessage(lastLine(message.message));
    }
  });
  agent.open(opening);

  el.model.addEventListener("click", async () => {
    const picked = await switchProvider(container);
    if (picked) {
      const previous = { creds, model: { ...config } };
      creds = picked;
      const { ai_base_url, ai_provider, ai_model } = buildConfig(incoming, picked);
      Object.assign(config, { ai_base_url, ai_provider, ai_model });
      showModel();
      const { ai_base_url: url, ai_api_key } = workerConfig();
      await agent
        .switchModel({ ai_base_url: url, ai_provider, ai_model, ai_api_key })
        .catch((e) => {
          // The worker kept the model it had, so the page, and the next reload, keep it too.
          creds = previous.creds;
          saveCredentials(previous.creds);
          Object.assign(config, previous.model);
          showModel();
          chat.addErrorMessage(`Could not switch the model: ${lastLine(String(e))}`);
        });
    }
  });

  // Saving is deliberate, as for any other Galaxy visualization: a revision then marks a
  // save the user asked for rather than a conversation turn.
  el.save.addEventListener("click", async () => {
    el.save.disabled = true;
    el.save.textContent = "Saving...";
    try {
      const document = await agent.export("");
      savedId = await saved.save(document, savedId);
      await agent.saved(savedId, document);
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

  function submit() {
    const text = el.input.value.trim();
    if (!text || busy) {
      return;
    }
    if (!ready) {
      info("Olit is still starting; send again once it says it is ready.");
      return;
    }
    el.input.value = "";
    el.input.style.height = "auto";
    // Busy from the click: the run starts once the worker has stored the message.
    setBusy(true);
    chat.showThinking();
    agent.submit(text);
  }

  function stop() {
    if (busy) {
      agent.stop();
    }
  }

  el.send.addEventListener("click", submit);
  el.abort.addEventListener("click", stop);
  // loom: "reset session -- fresh start, no --continue".
  el.reset.addEventListener("click", () => {
    if (busy || !ready) {
      return;
    }
    // A new conversation; the old one stays, saved or not, and its record on Galaxy too.
    savedId = undefined;
    reportSavedState(true);
    el.artifactContent.innerHTML = "";
    afterReset =
      "Started a new conversation. The previous one stays in this browser but is no longer " +
      "reachable from here unless you saved it; its record on Galaxy is untouched.";
    agent.reset();
  });
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  // Esc stops the run; bound on the container because olit lives in an iframe.
  container.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && busy) {
      stop();
    }
  });

  // Approve / Edit / Reject on a plan draft card; wording follows loom's handler.
  el.messages.addEventListener("plan-draft-action", (e) => {
    const { action, body } = (e as CustomEvent<{ action: string; body: string }>).detail;
    if (action === "approve") {
      // loom's init gate refuses /execute when Galaxy cannot run the plan.
      if (!galaxyCanRun(galaxyStatus)) {
        chat.addErrorMessage(galaxyRefusalMessage());
        return;
      }
      el.input.value =
        "I approve the plan above. Show the full parameter table for review before executing.";
      submit();
    } else if (action === "reject") {
      el.input.value = "Reject the plan above — let's rethink it.";
      submit();
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

void main();
