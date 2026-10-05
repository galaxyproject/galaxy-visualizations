import type { BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { classify, destructiveGate, type Ask } from "./destructive";
import { olitTools } from "./session";
import { traitsOf } from "./tool";

const TRAITS = new Map(olitTools().map((t) => [t.name, traitsOf(t)]));
const DESTROYS = (name: string, args: Record<string, unknown>) =>
  TRAITS.get(name)?.destroys(args) === true;

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
  destructiveGate(ask, DESTROYS)(context(name, args));

describe("classify", () => {
  it("treats only an explicit true as a history delete", () => {
    expect(classify("update_history", { deleted: false }, DESTROYS)).toBeUndefined();
    expect(classify("update_history", {}, DESTROYS)).toBeUndefined();
  });

  it("says a history delete covers the whole history and is recoverable", () => {
    expect(classify("update_history", { history_id: "h1", deleted: true }, DESTROYS)).toBe(
      "Mark the entire history (h1) as deleted — not just specific datasets. " +
        "Recoverable via Undelete on most Galaxy servers, but it affects the whole history.",
    );
    expect(classify("update_history", { history_id: 7, deleted: true }, DESTROYS)).toContain(
      "Mark the entire history as deleted",
    );
  });

  it("classifies every operation galaxy-ops flags as destructive", () => {
    const headline = classify("delete_user_tool", { uuid: "u1" }, DESTROYS);
    expect(headline).toContain("delete_user_tool");
    expect(headline).toContain("cannot be undone");
  });

  it("does not classify unrelated tools", () => {
    expect(classify("create_history", { history_name: "x" }, DESTROYS)).toBeUndefined();
    expect(classify("run_tool", { deleted: true }, DESTROYS)).toBeUndefined();
  });
});

describe("destructiveGate", () => {
  it("refuses a history delete when nobody can approve it", async () => {
    const result = await gate("update_history", { history_id: "h1", deleted: true });
    expect(result?.block).toBe(true);
    expect(result?.reason?.startsWith("Refused:")).toBe(true);
    expect(result?.reason).toContain("h1");
  });

  it("asks before cancelling an invocation, which galaxy-ops flags", async () => {
    const user = asked(false);
    const result = await gate("cancel_workflow_invocation", { invocation_id: "i1" }, user.ask);
    expect(user.questions).toHaveLength(1);
    expect(result?.block).toBe(true);
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
    await gate("delete_user_tool", { uuid: "u1" }, user.ask);
    expect(user.questions).toHaveLength(1);
    expect(user.questions[0].message).toContain("cannot be undone");
    expect(user.questions[0].title).toBeTruthy();
  });

  it("never remembers an approval between calls", async () => {
    const user = asked(true);
    const check = destructiveGate(user.ask, DESTROYS);
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
