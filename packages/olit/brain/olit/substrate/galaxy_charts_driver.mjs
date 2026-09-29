// Reaches galaxy-charts' option resolution for a brain outside the browser, with an api key.
//
// Framed as the galaxy-ops driver frames: the byte length on one line, then that many bytes of JSON.
import { Console } from "node:console";

import { getOptions } from "galaxy-charts/runtime";
import { compile } from "vega-lite";

import { noRedirect } from "./no_redirect.mjs";

// stdout carries the framing, so anything logged goes to stderr instead.
globalThis.console = new Console(process.stderr);

const ROOT = (process.env.GALAXY_ROOT || "").replace(/\/+$/, "");
const KEY = process.env.GALAXY_KEY || "";

async function body(response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function keyed(path) {
  const response = await noRedirect(`${ROOT}/${path}`, { headers: KEY ? { "x-api-key": KEY } : {} });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${path} redirected to ${response.headers.get("location")}; the api key is not sent there.`);
  }
  return body(response);
}

const client = {
  api: keyed,
  url: async (target) => body(await fetch(target)),
};

function send(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`${payload.length}\n`);
  process.stdout.write(payload);
}

export function noSuchCall(name) {
  return { success: false, errorKind: "not_found", message: `galaxy-charts has no call named '${name}'` };
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

export async function answer(request, options = getOptions) {
  if (request.name === "compile") {
    try {
      return { success: true, data: compiled((request.args || {}).spec) };
    } catch (err) {
      return unexpectedFailure(err);
    }
  }
  if (request.name !== "get_options") {
    return noSuchCall(request.name);
  }
  try {
    const { input, context } = request.args || {};
    return { success: true, data: await options(input || {}, { ...(context || {}), client }) };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

let buffered = Buffer.alloc(0);
let wanted = null;
const queue = [];
let draining = false;

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length > 0) {
    const request = queue.shift();
    send({ id: request.id, envelope: await answer(request) });
  }
  draining = false;
}

process.stdin.on("data", (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  for (;;) {
    if (wanted === null) {
      const cut = buffered.indexOf(10);
      if (cut < 0) return;
      wanted = Number(buffered.subarray(0, cut).toString("utf8"));
      buffered = buffered.subarray(cut + 1);
    }
    if (buffered.length < wanted) return;
    queue.push(JSON.parse(buffered.subarray(0, wanted).toString("utf8")));
    buffered = buffered.subarray(wanted);
    wanted = null;
    void drain();
  }
});
