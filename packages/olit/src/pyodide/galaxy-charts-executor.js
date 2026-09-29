/** Reaches galaxy-charts' option resolution over the page's own Galaxy session. */
import { getOptions } from "galaxy-charts/runtime";
import { compile } from "vega-lite";

async function body(response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return await response.json();
}

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

// Galaxy's page renderer compiles with this same vega-lite, so its verdict is the page's.
export function compiled(spec) {
  const problems = [];
  const logger = {
    level: () => logger,
    error: (...parts) => problems.push(parts.join(" ")),
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
  try {
    compile(spec, { logger });
  } catch (err) {
    problems.push(String(err?.message ?? err));
  }
  return { compiles: problems.length === 0, problems };
}

export function install(galaxy) {
  const credentials = galaxy.credentials || "include";
  const root = String(galaxy.root || "/").replace(/\/+$/, "");
  const client = {
    api: async (path) => body(await fetch(`${root}/${path}`, { credentials })),
    url: async (target) => body(await fetch(target)),
  };
  globalThis.olitGetChartsOptions = async (name, args) => {
    if (name === "compile") {
      try {
        return { success: true, data: compiled((args || {}).spec) };
      } catch (err) {
        return unexpectedFailure(err);
      }
    }
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
