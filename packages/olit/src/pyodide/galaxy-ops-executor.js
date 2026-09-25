/**
 * One way in to every galaxy-ops operation, for the brain to call across the Pyodide boundary.
 *
 * Generic on purpose: it looks an operation up by name and runs it. Nothing here knows what any
 * operation does, which is what keeps the Galaxy behaviour in galaxy-ops rather than split
 * between it and a bridge.
 *
 * The browser entry registers only the operations that run here, so a name this cannot find is
 * one this build genuinely does not have, rather than one that would fail on use.
 */
import {
  allOperations,
  createGalaxyContext,
  runWithEnvelope,
} from "@galaxyproject/galaxy-ops/browser";

/**
 * Galaxy as olit reaches it: as the user whose session the page is already in. olit carries no
 * Galaxy key by design, so the client's own x-api-key header is dropped rather than sent empty.
 */
function galaxyFetch(credentials) {
  return (url, options) => {
    const init = { ...(options || {}) };
    init.credentials = credentials || "include";
    const headers = { ...(init.headers || {}) };
    delete headers["x-api-key"];
    return fetch(url, { ...init, headers });
  };
}

export function install(galaxy) {
  const byName = new Map(allOperations.map((op) => [op.name, op]));
  const ctx = createGalaxyContext({
    baseUrl: galaxy.root,
    // Required by the signature and unused: galaxyFetch drops the header it would set.
    apiKey: "",
    fetchImpl: galaxyFetch(galaxy.credentials),
  });
  globalThis.olitRunOperation = async (name, args) => {
    const op = byName.get(name);
    if (!op) {
      return { success: false, errorKind: "not_found", message: `no operation named '${name}'` };
    }
    return runWithEnvelope(op, args || {}, ctx);
  };
  globalThis.olitOperationNames = () => [...byName.keys()];
}
