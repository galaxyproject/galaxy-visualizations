import type { BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { classify, describe as headline, destructiveGate, type Ask } from "./destructive";

const context = (name: string, args: Record<string, unknown>) =>
  ({
    toolCall: { type: "toolCall", id: "c1", name, arguments: args },
    args,
  }) as unknown as BeforeToolCallContext;

/** A user who answers every approval the same way, and remembers being asked. */
function asked(answer: boolean) {
  const questions: Array<{ title: string; message: string }> = [];
  const ask: Ask = async (title, message) => {
    questions.push({ title, message });
    return answer;
  };
  return { ask, questions };
}

const gate = (name: string, args: Record<string, unknown>, ask?: Ask) =>
  destructiveGate(ask)(context(name, args));

describe("classify", () => {
  it("treats only an explicit true as destructive", () => {
    expect(classify("update_history", { deleted: false })).toBeUndefined();
    expect(classify("update_history", {})).toBeUndefined();
  });

  it("normalizes the galaxy prefix", () => {
    expect(classify("galaxy_update_history", { deleted: true })).toEqual({
      irreversible: false,
      historyId: undefined,
    });
  });

  it("ranks purge over delete when both are set", () => {
    expect(classify("update_history", { deleted: true, purged: true })?.irreversible).toBe(true);
  });

  it("does not classify unrelated tools", () => {
    expect(classify("create_history", { history_name: "x" })).toBeUndefined();
    expect(classify("run_tool", { deleted: true })).toBeUndefined();
  });

  it("carries a string history id only", () => {
    expect(classify("update_history", { history_id: "h1", deleted: true })?.historyId).toBe("h1");
    expect(classify("update_history", { history_id: 7, deleted: true })?.historyId).toBeUndefined();
  });
});

describe("describe", () => {
  it("names the purged history, or the entire history", () => {
    expect(headline({ irreversible: true, historyId: "h1" })).toBe(
      "Permanently PURGE history h1 — this deletes all of its datasets and cannot be undone.",
    );
    expect(headline({ irreversible: true })).toContain("PURGE the entire history");
  });

  it("says a delete is whole-history and recoverable", () => {
    expect(headline({ irreversible: false, historyId: "h1" })).toBe(
      "Mark the entire history (h1) as deleted — not just specific datasets. " +
        "Recoverable via Undelete on most Galaxy servers, but it affects the whole history.",
    );
    expect(headline({ irreversible: false })).toContain("Mark the entire history as deleted");
  });
});

describe("destructiveGate", () => {
  it("refuses a history delete when nobody can approve it", async () => {
    const result = await gate("update_history", { history_id: "h1", deleted: true });
    expect(result?.block).toBe(true);
    expect(result?.reason?.startsWith("Refused:")).toBe(true);
    expect(result?.reason).toContain("h1");
  });

  it("says a purge cannot be undone", async () => {
    expect((await gate("update_history", { history_id: "h1", purged: true }))?.reason).toContain(
      "cannot be undone",
    );
  });

  it("says a delete covers the whole history and is recoverable", async () => {
    const reason = (await gate("update_history", { history_id: "h1", deleted: true }))?.reason;
    expect(reason).toContain("entire history");
    expect(reason).toContain("Recoverable");
  });

  it("lets a non-destructive update through", async () => {
    expect(await gate("update_history", { history_id: "h1", name: "renamed" })).toBeUndefined();
  });

  it("lets an approved delete through", async () => {
    const user = asked(true);
    expect(
      await gate("update_history", { history_id: "h1", deleted: true }, user.ask),
    ).toBeUndefined();
    expect(user.questions).toHaveLength(1);
  });

  it("blocks a declined delete", async () => {
    const result = await gate(
      "update_history",
      { history_id: "h1", deleted: true },
      asked(false).ask,
    );
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("declined");
  });

  it("asks with the honest headline", async () => {
    const user = asked(false);
    await gate("update_history", { history_id: "h1", purged: true }, user.ask);
    expect(user.questions).toHaveLength(1);
    expect(user.questions[0].message).toContain("cannot be undone");
    expect(user.questions[0].title).toBeTruthy();
  });

  it("never remembers an approval between calls", async () => {
    const user = asked(true);
    const check = destructiveGate(user.ask);
    for (let i = 0; i < 3; i++) {
      await check(context("update_history", { history_id: "h1", deleted: true }));
    }
    expect(user.questions).toHaveLength(3);
  });

  it("asks nothing for a non-destructive call", async () => {
    const user = asked(true);
    await gate("update_history", { history_id: "h1", name: "renamed" }, user.ask);
    expect(user.questions).toEqual([]);
  });

  it("reads a broken confirmation bridge as no", async () => {
    const gone: Ask = async () => {
      throw new Error("worker torn down");
    };
    const result = await gate("update_history", { history_id: "h1", deleted: true }, gone).catch(
      () => "threw",
    );
    expect(result).not.toBe("threw");
    expect((result as { reason?: string })?.reason?.startsWith("Refused:")).toBe(true);
  });

  it("refuses in JSON-free text the model can act on", async () => {
    const reason = (await gate("update_history", { history_id: "h1", deleted: true }))!.reason!;
    expect(() => JSON.parse(reason)).toThrow();
    expect(reason).toContain("Galaxy interface");
  });
});
