import { authorizedFetch } from "./llm-fetch.js";

let loadPyodide = null;
let pyodide = null;
let running = false;
// Abort authority for the current run; the worker owns it because fetch needs it.
let abortController = null;
// Outstanding approvals; the run is parked on these, so abort must drain them.
const pendingConfirms = new Map();
let confirmSeq = 0;

function settleConfirms(approved) {
  for (const resolve of pendingConfirms.values()) {
    resolve(approved);
  }
  pendingConfirms.clear();
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;
  // Handled first and without an id: it arrives while a run is in flight.
  if (type === "abort") {
    if (running && abortController) {
      abortController.abort();
      // A turn parked on an approval would otherwise never resume.
      settleConfirms(false);
    }
    return;
  }
  if (type === "confirmResult") {
    const resolve = pendingConfirms.get(payload.confirmId);
    if (resolve) {
      pendingConfirms.delete(payload.confirmId);
      resolve(payload.approved === true);
    }
    return;
  }
  if (type === "initialize") {
    try {
      if (!loadPyodide) {
        const mod = await import(`${payload.indexURL}/pyodide.mjs`);
        loadPyodide = mod.loadPyodide;
      }
      pyodide = await loadPyodide({ indexURL: payload.indexURL });
      // The brain fetches through this; the key stays here, out of the interpreter.
      globalThis.olitFetch = authorizedFetch(fetch, payload.llm);
      const pyodidePackages = payload.packages;
      if (pyodidePackages) {
        console.debug("[pyodide-worker] Installing packages:", pyodidePackages);
        await pyodide.loadPackage(pyodidePackages);
      }
      for (const whl of payload.extraPackages || []) {
        console.log(`Loading ${whl}`);
        await pyodide.runPythonAsync(
          `import micropip\nawait micropip.install(${JSON.stringify(whl)})`,
        );
        console.log(`Loaded ${whl}`);
      }
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
  } else {
    if (pyodide) {
      if (type === "runPythonAsync") {
        running = true;
        abortController = new AbortController();
        globalThis.olitAborted = () => abortController?.signal.aborted === true;
        globalThis.olitAbortSignal = () => abortController?.signal;
        // The events channel in reverse; answered by `confirmResult`.
        globalThis.olitConfirm = (json) =>
          new Promise((resolve) => {
            if (abortController?.signal.aborted) {
              resolve(false);
              return;
            }
            const confirmId = `${id}:${confirmSeq++}`;
            pendingConfirms.set(confirmId, resolve);
            try {
              self.postMessage({ type: "confirm", id, confirmId, request: JSON.parse(json) });
            } catch (err) {
              pendingConfirms.delete(confirmId);
              resolve(false);
            }
          });
        // Bridge for live progress; only a string crosses the boundary.
        globalThis.olitEmit = (json) => {
          try {
            self.postMessage({ type: "event", id, event: JSON.parse(json) });
          } catch (err) {
            // ignore a malformed event payload
          }
        };
        try {
          const result = await pyodide.runPythonAsync(payload.code);
          self.postMessage({ id, result });
        } catch (err) {
          self.postMessage({ id, error: String(err) });
        } finally {
          running = false;
          abortController = null;
          settleConfirms(false);
          globalThis.olitEmit = undefined;
          globalThis.olitAborted = undefined;
          globalThis.olitAbortSignal = undefined;
          globalThis.olitConfirm = undefined;
        }
      } else {
        self.postMessage({ id, error: `Unknown message type: ${type}` });
      }
    } else {
      self.postMessage({ id, error: "Pyodide not initialized" });
    }
  }
};
