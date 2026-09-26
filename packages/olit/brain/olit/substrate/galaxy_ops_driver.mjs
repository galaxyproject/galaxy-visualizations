// Runs galaxy-ops operations for a brain outside the browser. Generic -- it knows no
// operation, only how to find one.
//
// Each message is its byte length on one line, then that many bytes of JSON. An answer can
// be megabytes, which is past what a line-oriented reader will buffer, and a reader that
// gives up mid-line would pair every later answer with the wrong question.
import { allOperations, createGalaxyContext, runWithEnvelope } from "@galaxyproject/galaxy-ops/browser";

const ctx = createGalaxyContext({ baseUrl: process.env.GALAXY_ROOT, apiKey: process.env.GALAXY_KEY });
const byName = new Map(allOperations.map((op) => [op.name, op]));

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`${body.length}\n`);
  process.stdout.write(body);
}

async function answer(request) {
  const op = byName.get(request.name);
  if (!op) {
    return { success: false, message: `galaxy-ops has no operation named ${request.name}` };
  }
  try {
    return await runWithEnvelope(op, request.args, ctx);
  } catch (err) {
    return { success: false, message: String(err?.message ?? err) };
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
