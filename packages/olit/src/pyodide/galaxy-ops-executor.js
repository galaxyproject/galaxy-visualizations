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
 *
 * The client calls this with one Request rather than a url and an init, so the method, the body
 * and the content type all live on that object. It is rebuilt from itself with the key removed,
 * because an init assembled here would replace its headers instead of amending them -- which
 * cost a form-encoded POST its content type, and Galaxy then read no name out of the body.
 */
function galaxyFetch(credentials) {
  return (input, options) => {
    const request = input instanceof Request && !options ? input : new Request(input, options);
    const headers = new Headers(request.headers);
    headers.delete("x-api-key");
    return fetch(new Request(request, { headers, credentials: credentials || "include" }));
  };
}

export { galaxyFetch as __galaxyFetchForTest };

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
