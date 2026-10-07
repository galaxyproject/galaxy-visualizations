import {
  MemoryStorage,
  type Conversation,
  type EntryRecord,
  type Storage,
  type TaskId,
} from "@earendil-works/pi-durable";

import { Binding } from "./documents";
import type { RecordSummary } from "./notebook";
import { context, Runtime, type Placement, type RuntimeConfig } from "./runtime";
import type { Python } from "./tool";
import { WATCH_TASK, type Settled } from "./watch";

export interface HeadlessConfig extends RuntimeConfig {
  history_id?: string;
  dataset_id?: string;
  /** The conversation's own instructions, after Olit's prompt. */
  instructions?: string;
}

const timeout = (ms: number) =>
  new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));

/**
 * One conversation driven without a page, for the evaluation harness and tests: what it hands
 * back is pi-durable's own record of the conversation, the entries each step appended.
 */
export class Headless {
  /** The newest entry already handed back. */
  private last = 0;
  /** What a restart was launched on, and the records it offered to continue. */
  private launch: Placement = {};
  private offered: RecordSummary[] = [];

  private constructor(
    readonly runtime: Runtime,
    public conversation: Conversation,
  ) {}

  static async open(
    config: HeadlessConfig,
    options: {
      python: Python;
      env?: Record<string, string | undefined>;
      storage?: Storage;
      pollMs?: number;
    },
  ) {
    const runtime = await Runtime.open({
      storage: options.storage ?? new MemoryStorage(),
      config,
      python: options.python,
      env: options.env,
      pollMs: options.pollMs,
    });
    const conversation = await runtime.create({
      historyId: config.history_id,
      datasetId: config.dataset_id,
      instructions: config.instructions,
    });
    return new Headless(runtime, conversation);
  }

  /** The entries appended since the last hand-back, in order. */
  private async fresh(): Promise<EntryRecord[]> {
    const entries = (await this.conversation.context(context)).entries.filter(
      (e) => e.id > this.last,
    );
    this.last = Math.max(this.last, ...entries.map((e) => e.id));
    return entries;
  }

  /** The user's message, answered: how its submission settled, and what the run appended. */
  async turn(text: string) {
    const settled = await (await this.runtime.submit(this.conversation, text)).wait(context);
    return {
      status: settled.status,
      ...(settled.status === "unanswered"
        ? { reason: (settled as { reason?: string }).reason }
        : {}),
      entries: await this.fresh(),
    };
  }

  /** Galaxy work the conversation still watches. */
  private async watching(): Promise<TaskId[]> {
    const { tasks } = await this.runtime.harness.inspect(context);
    return tasks
      .filter(
        (t) => t.record.kind === WATCH_TASK && t.record.conversationId === this.conversation.id,
      )
      .map((t) => t.record.id);
  }

  /**
   * Wait for submitted work to settle and for the runs its follow-ups start, as an open tab would:
   * what settled, and the entries those runs appended.
   */
  async settle(timeoutSeconds: number) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    const settled: Settled[] = [];
    let pending = await this.watching();
    while (Date.now() < deadline) {
      for (const id of pending) {
        const done = await Promise.race([
          this.runtime.harness.waitForTask(id, context),
          timeout(deadline - Date.now()),
        ]);
        if (done === "timeout") break;
        const outcome = done.state.outcome;
        if (outcome.status === "completed") settled.push(outcome.result as unknown as Settled);
      }
      const idle = await Promise.race([
        this.conversation.waitForIdle(context),
        timeout(deadline - Date.now()),
      ]);
      pending = await this.watching();
      if (idle === "timeout" || !pending.length) break;
    }
    return { settled, pending: pending.length, entries: await this.fresh() };
  }

  /**
   * A tab closed and opened again with nothing stored, as a browser does it: launched on the same
   * history and dataset, it offers the Olit records attached to that history and starts nothing
   * until `recover` says which session this is, as the user does in a tab. With no records, a new
   * session starts at once.
   */
  async restart(): Promise<RecordSummary[]> {
    const bound = await this.runtime.harness.snapshot(Binding, this.conversation.id, context);
    this.launch = { historyId: bound?.historyId, datasetId: bound?.datasetId };
    this.offered = await this.runtime.records(bound?.historyId);
    if (!this.offered.length) await this.recover();
    return this.offered;
  }

  /** Continue the offered session whose record is `pageId`, or start a new one. */
  async recover(pageId?: string) {
    const record = this.offered.find((r) => r.pageId === pageId);
    if (pageId && !record) throw new Error(`No offered record ${pageId}.`);
    this.conversation = await this.runtime.create({
      ...this.launch,
      ...(record ? { record } : {}),
    });
    this.offered = [];
    this.last = 0;
    await this.fresh();
  }

  export(title = "") {
    return this.runtime.export(this.conversation, title);
  }

  close() {
    return this.runtime.close();
  }
}
