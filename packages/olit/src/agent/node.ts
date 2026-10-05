import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { describe } from "./describe";
import { localPython } from "./python";
import { failedTurn, Session } from "./session";

/** One session over JSON lines: `create`, `prepare`, `turn`, `close`; events stream before a turn's result. */
const indexURL = pathToFileURL(
  dirname(createRequire(import.meta.url).resolve("pyodide/pyodide.mjs")),
).href;
const write = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
let session: Session | undefined;

if (process.argv.includes("--describe")) {
  const root = process.argv[process.argv.indexOf("--root") + 1] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(await describe(root), null, 2)}\n`);
  process.exit(0);
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) {
    continue;
  }
  const request = JSON.parse(line);
  try {
    if (request.op === "create") {
      session = await Session.create(request.config, localPython(indexURL), process.env);
      write({ result: {} });
    } else if (request.op === "prepare") {
      write({
        result: await session!.prepare(
          request.transcripts,
          request.record_page_id,
          request.history_id,
        ),
      });
    } else if (request.op === "turn") {
      const result = await session!.turn(request.messages, {
        onEvent: (event) => write({ event }),
        artifacts: request.artifacts,
        watching: request.watching,
      });
      write({ result });
    } else if (request.op === "close") {
      break;
    }
  } catch (err) {
    write(
      request.op === "turn"
        ? { result: failedTurn(request.messages, err) }
        : { error: String(err) },
    );
  }
}
