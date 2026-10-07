/**
 * One assistant answer's text as pi-durable streams it, turned into what the chat appends. The chat
 * only appends, so each step returns the text added since the last one: an answer starts with
 * `message_start` (its first partial, which can already hold text, or the whole answer), grows by
 * `message_update`, and ends with the stored answer at `message_end`.
 */
import type { MessageChange } from "@earendil-works/pi-durable";

type Content = { content: ReadonlyArray<{ type: string; text?: string }> };

/** A message's text blocks by content index; other blocks hold none. */
const textBlocks = (message: Content) =>
  message.content.map((c) => (c.type === "text" ? (c.text ?? "") : ""));

export class StreamedReply {
  private blocks: string[] = [];
  private shown = "";

  /** Begin an answer from its first partial, or from nothing. */
  start(message?: Content): string {
    this.blocks = message ? textBlocks(message) : [];
    this.shown = "";
    return this.grown();
  }

  /** Apply pi-durable's changes to the in-flight answer. */
  update(changes: readonly MessageChange[]): string {
    for (const change of changes) {
      if (change.type === "text_delta") {
        this.blocks[change.contentIndex] = (this.blocks[change.contentIndex] ?? "") + change.delta;
      } else if (change.type === "text_start" || change.type === "block") {
        if (change.block.type === "text") this.blocks[change.contentIndex] = change.block.text;
      } else if (change.type === "message") {
        this.blocks = textBlocks(change.message);
      }
    }
    return this.grown();
  }

  /** End the answer with its stored text: what of it is not shown yet. */
  end(text: string): string {
    const rest = text.startsWith(this.shown) ? text.slice(this.shown.length) : "";
    this.blocks = [];
    this.shown = "";
    return rest;
  }

  /** What the answer has grown by, when it still continues what was shown. */
  private grown(): string {
    const text = this.blocks.join("");
    if (!text.startsWith(this.shown)) return "";
    const added = text.slice(this.shown.length);
    this.shown = text;
    return added;
  }
}
