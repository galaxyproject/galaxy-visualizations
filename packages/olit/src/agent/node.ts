import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { describe } from "./describe";
import { localPython } from "./python";
import { toChat } from "./messages";
import { failedTurn, Session, type TurnResult } from "./session";
import { DEFAULT_MAX_AUTO_FOLLOW_UPS } from "./watch";

/** One session over JSON lines: `create`, `turn`, `settle`, `close`; events stream before a turn's result. */
/** Where Pyodide lives, resolved only when a session needs it: `--describe` runs without it. */
const pyodideURL = () =>
  pathToFileURL(dirname(createRequire(import.meta.url).resolve("pyodide/pyodide.mjs"))).href;
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
        session = await Session.create(request.config, localPython(pyodideURL()), process.env);
        write({ result: {} });
      } else if (request.op === "turn") {
        const result = await session!.turn(request.messages, {
          onEvent: (event) => write({ event }),
          artifacts: request.artifacts,
        });
        write({ result: graded(result) });
      } else if (request.op === "settle") {
        // The same pass the page makes between turns, with the same follow-up it would send.
        const { settled, pending, followUp } = await session!.settle();
        write({
          result: {
            settled,
            pending,
            follow_up: followUp ?? null,
            max_auto_follow_ups: DEFAULT_MAX_AUTO_FOLLOW_UPS,
          },
        });
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
