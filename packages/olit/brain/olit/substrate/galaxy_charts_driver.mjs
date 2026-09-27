// Resolves a visualization input's options for a brain outside the browser.
//
// Knows one call, and nothing about what any input type means: galaxy-charts owns which endpoint
// an option kind draws on and how its payload becomes options. What lives here is the connection,
// because reaching Galaxy off the browser needs a key the page session would otherwise carry.
//
// Framed as the galaxy-ops driver frames: the byte length on one line, then that many bytes of JSON.
import { getOptions } from "galaxy-charts/runtime";

const ROOT = process.env.GALAXY_ROOT || "";
const KEY = process.env.GALAXY_KEY || "";

async function body(response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return await response.json();
}

const client = {
  api: async (path) => body(await fetch(`${ROOT}${path}`, { headers: KEY ? { "x-api-key": KEY } : {} })),
  url: async (target) => body(await fetch(target)),
};

function send(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`${payload.length}\n`);
  process.stdout.write(payload);
}

// Stated as src/pyodide/galaxy-charts-executor.js states them: the same fault has to read the same
// way whichever executor carried the call.
export function noSuchCall(name) {
  return { success: false, errorKind: "not_found", message: `galaxy-charts has no call named '${name}'` };
}

export function unexpectedFailure(err) {
  return { success: false, errorKind: "unexpected", message: String(err?.message ?? err) };
}

export async function answer(request, options = getOptions) {
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
