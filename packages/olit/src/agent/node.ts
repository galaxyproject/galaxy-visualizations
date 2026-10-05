import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { describe } from "./describe";
import { localPython } from "./python";
import { toChat } from "./messages";
import { failedTurn, Session, type TurnResult } from "./session";

/** One session over JSON lines: `create`, `prepare`, `turn`, `close`; events stream before a turn's result. */
const indexURL = pathToFileURL(
  dirname(createRequire(import.meta.url).resolve("pyodide/pyodide.mjs")),
).href;
const write = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);

/** A turn as pi holds it, plus the OpenAI chat shape the harness grades. */
const graded = (result: TurnResult) => ({
  ...result,
  transcript: toChat(result.messages),
  new_transcript: toChat(result.new_messages),
});
let session: Session | undefined;

/** Not top-level await: a lazily imported provider is declared after this module's body, so
 * the module has to finish evaluating before the first request reaches it. */
async function main() {
  if (process.argv.includes("--describe")) {
    const root = process.argv[process.argv.indexOf("--root") + 1] ?? process.cwd();
    process.stdout.write(`${JSON.stringify(await describe(root), null, 2)}\n`);
    return;
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
        write({ result: graded(result) });
      } else if (request.op === "close") {
        break;
      }
    } catch (err) {
      write(
        request.op === "turn"
          ? { result: graded(failedTurn(request.messages, err)) }
          : { error: String(err) },
      );
    }
  }
}

// Exit once stdout drains: a pipe write is asynchronous on macOS, and exiting first truncates it.
void main().then(() => process.stdout.write("", () => process.exit(0)));
