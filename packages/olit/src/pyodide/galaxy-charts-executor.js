/**
 * One way in to galaxy-charts' option resolution, for the brain to call across the Pyodide boundary.
 *
 * Knows one call and nothing about what any input type means: galaxy-charts owns which endpoint an
 * option kind draws on and how its payload becomes options, so a new type needs no change here.
 * What this holds is the connection, as the user whose session the page is already in.
 */
import { getOptions } from "galaxy-charts/runtime";

async function body(response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return await response.json();
}

/** Stated as brain/olit/substrate/galaxy_charts_driver.mjs states them. */
export function noSuchCall(name) {
  return {
    success: false,
    errorKind: "not_found",
    message: `galaxy-charts has no call named '${name}'`,
  };
}

export function unexpectedFailure(err) {
  return { success: false, errorKind: "unexpected", message: String(err?.message ?? err) };
}

export function install(galaxy) {
  const credentials = galaxy.credentials || "include";
  const client = {
    api: async (path) => body(await fetch(`${galaxy.root || "/"}${path}`, { credentials })),
    url: async (target) => body(await fetch(target)),
  };
  globalThis.olitGetChartsOptions = async (name, args) => {
    if (name !== "get_options") {
      return noSuchCall(name);
    }
    try {
      const { input, context } = args || {};
      return { success: true, data: await getOptions(input || {}, { ...(context || {}), client }) };
    } catch (err) {
      return unexpectedFailure(err);
    }
  };
}
