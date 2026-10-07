import type { MessageChange } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";

import { StreamedReply } from "./streamed-reply";

const text = (t: string) => ({ type: "text", text: t }) as const;
const message = (...content: { type: string; text?: string }[]) => ({ content });
const changes = (...c: unknown[]) => c as MessageChange[];

/** Everything a reply appended, from the steps given. */
function appended(steps: ((reply: StreamedReply) => string)[]): string {
  const reply = new StreamedReply();
  return steps.map((step) => step(reply)).join("");
}

describe("a streamed answer appends exactly its stored text", () => {
  it("starts with the text its first partial already holds", () => {
    expect(
      appended([
        (r) => r.start(message(text("The **Plotly "))),
        (r) =>
          r.update(changes({ type: "text_delta", contentIndex: 0, delta: "scatter** is saved." })),
        (r) => r.end("The **Plotly scatter** is saved. Done."),
      ]),
    ).toBe("The **Plotly scatter** is saved. Done.");
  });

  it("shows an answer that arrives whole", () => {
    expect(
      appended([(r) => r.start(message(text("All at once."))), (r) => r.end("All at once.")]),
    ).toBe("All at once.");
  });

  it("follows a block that starts with text, arrives whole, or a message replaced whole", () => {
    expect(
      appended([
        (r) => r.start(),
        (r) => r.update(changes({ type: "text_start", contentIndex: 0, block: text("Half") })),
        (r) =>
          r.update(changes({ type: "block", contentIndex: 0, block: text("Half a sentence") })),
        (r) =>
          r.update(
            changes({ type: "message", message: message(text("Half a sentence, then more.")) }),
          ),
        (r) => r.end("Half a sentence, then more."),
      ]),
    ).toBe("Half a sentence, then more.");
  });

  it("reads only text blocks, by their index", () => {
    expect(
      appended([
        (r) => r.start(message({ type: "thinking" }, text("Seen"))),
        (r) => r.update(changes({ type: "thinking_delta", contentIndex: 0, delta: "unseen" })),
        (r) => r.update(changes({ type: "text_delta", contentIndex: 1, delta: " here." })),
        (r) => r.end("Seen here."),
      ]),
    ).toBe("Seen here.");
  });

  it("adds at the end what the stored answer holds beyond what streamed", () => {
    expect(
      appended([
        (r) => r.start(),
        (r) => r.update(changes({ type: "text_delta", contentIndex: 0, delta: "Cut " })),
        (r) => r.end("Cut off no longer."),
      ]),
    ).toBe("Cut off no longer.");
  });

  it("appends nothing that would not continue what is shown, and starts clean after an end", () => {
    const reply = new StreamedReply();
    expect(reply.start(message(text("Draft")))).toBe("Draft");
    expect(reply.update(changes({ type: "message", message: message(text("Other")) }))).toBe("");
    expect(reply.end("Other")).toBe("");
    expect(reply.start(message(text("Next")))).toBe("Next");
  });
});
