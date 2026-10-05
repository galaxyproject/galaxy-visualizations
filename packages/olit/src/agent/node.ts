import { createInterface } from "node:readline";

import { describe } from "./describe";
import { nodePython } from "./python-node";
import { toChat } from "./messages";
import { failedTurn, Session, type TurnResult } from "./session";
import { DEFAULT_MAX_AUTO_FOLLOW_UPS } from "./watch";

/** One session over JSON lines: `create`, `turn`, `settle`, `call`, `close`; a turn's events stream before its result. */
const write = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
// stdout carries the protocol and nothing else.
console.log = console.info = (...parts: unknown[]) => console.error(...parts);

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
        session = await Session.create(request.config, nodePython(), process.env);
        write({ result: {} });
      } else if (request.op === "turn") {
        const result = await session!.turn(request.messages, {
          onEvent: (event) => write({ event }),
          artifacts: request.artifacts,
        });
        write({ result: graded(result) });
      } else if (request.op === "call") {
        // One tool without a model, for a drive that checks it against a real Galaxy.
        write({ result: await session!.call(request.name, request.args ?? {}) });
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
