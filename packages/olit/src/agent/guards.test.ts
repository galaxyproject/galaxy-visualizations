import type { AgentMessage, BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { olitTools } from "./session";
import { traitsOf } from "./tool";
import { Watch, type Watched } from "./watch";

import {
  guards,
  notFoundHint,
  plainToolName,
  redact,
  withoutControlTokens,
  type GuardOptions,
} from "./guards";

type Args = Record<string, unknown>;
type Call = { id: string; name: string; arguments: Args };

const assistant = (calls: Call[]) =>
  ({
    role: "assistant",
    content: calls.map((c) => ({ type: "toolCall", ...c })),
  }) as AssistantMessage;

/** A session watch already holding these items. */
/** What each of Olit's tools says of itself, read off the real tool set. */
const TRAITS = new Map(olitTools().map((t) => [t.name, traitsOf(t)]));

function watchOf(items: Watched[]) {
  const watch = new Watch(async () => undefined);
  watch.add(items);
  return watch;
}

function session(overrides: Partial<GuardOptions> = {}) {
  let clock = 1_000_000;
  const g = guards({
    tools: TRAITS,
    watch: new Watch(async () => undefined),
    secrets: [],
    withheld: new Map(),
    advertised: [],
    now: () => clock,
    ...overrides,
  });
  const before = (call: Call, message = assistant([call])) =>
    g.beforeToolCall({
      assistantMessage: message,
      toolCall: { type: "toolCall", ...call },
      args: call.arguments,
      context: {},
    } as unknown as BeforeToolCallContext);
  const after = (text: string, name = "t") =>
    g.afterToolCall({
      assistantMessage: assistant([]),
      toolCall: { type: "toolCall", id: "c1", name, arguments: {} },
      args: {},
      result: { content: [{ type: "text", text }], details: undefined },
      isError: false,
      context: {},
    } as never);
  const tick = (ms: number) => (clock += ms);
  return { g, before, after, tick };
}

/** A call that runs when allowed, and counts its failure the way the session does. */
function runner(s: ReturnType<typeof session>) {
  let id = 0;
  const state = { executed: 0, fails: true };
  const call = async (name: string, args: Args, fails = state.fails) => {
    const blocked = await s.before({ id: `c${++id}`, name, arguments: args });
    if (blocked?.block) {
      return { refused: true, text: blocked.reason!, guard: s.g.guardOf(`c${id}`, name, false) };
    }
    state.executed++;
    if (fails) {
      s.g.noteFailure(name, `c${id}`);
    }
    return { refused: false, text: fails ? "boom" : "fine", guard: undefined };
  };
  return { call, state };
}

const toolResult = (toolName: string, text: string, isError = true) =>
  ({
    role: "toolResult",
    toolCallId: "c1",
    toolName,
    content: [{ type: "text", text }],
    isError,
    timestamp: 0,
  }) as AgentMessage;

const resultOf = (m: AgentMessage) =>
  m as unknown as { toolName: string; content: Array<{ type: string; text: string }> };

describe("repeated-failure guard", () => {
  it("does not count a failure the guard never checked, such as one pi refused for its arguments", async () => {
    const s = session();
    for (let i = 0; i < 3; i++) {
      s.g.noteFailure("t", `unchecked-${i}`);
    }
    expect(await s.before({ id: "c1", name: "t", arguments: {} })).toBeUndefined();
  });

  const REFUSED = { page_id: "p1", content: "history_dataset_id=reads" };

  it("refuses identical failures after the limit", async () => {
    const { call, state } = runner(session());
    for (let i = 0; i < 3; i++) {
      expect((await call("run_tool", { a: 1 })).refused).toBe(false);
    }
    const out = await call("run_tool", { a: 1 });
    expect(out.refused).toBe(true);
    expect(out.text).toContain("cannot succeed");
    expect(out.guard).toBe("repeated-failure");
    expect(state.executed).toBe(3);
  });

  it("lets changed arguments through", async () => {
    const { call } = runner(session());
    for (let i = 0; i < 5; i++) {
      expect((await call("run_tool", { a: i })).refused).toBe(false);
    }
  });

  it("breaks the loop without banning the call", async () => {
    const { call, state } = runner(session());
    for (let i = 0; i < 3; i++) {
      await call("run_tool", { a: 1 });
    }
    expect((await call("run_tool", { a: 1 })).refused).toBe(true);
    state.fails = false;
    const out = await call("run_tool", { a: 1 });
    expect(out.refused).toBe(false);
    expect(out.text).toBe("fine");
  });

  it("does not forgive failures for a success in between", async () => {
    const { call } = runner(session());
    for (let i = 0; i < 3; i++) {
      expect((await call("update_page", REFUSED)).refused).toBe(false);
      expect((await call("get_page", { page_id: "p1" }, false)).refused).toBe(false);
    }
    expect((await call("update_page", REFUSED)).guard).toBe("repeated-failure");
  });

  it("keeps a separate count for a different call", async () => {
    const { call } = runner(session());
    for (let i = 0; i < 3; i++) {
      await call("update_page", REFUSED);
    }
    expect(
      (await call("update_page", { ...REFUSED, content: "history_dataset_id=contigs" })).refused,
    ).toBe(false);
  });

  it("does not count a failure on one tool against another", async () => {
    const { call } = runner(session());
    for (let i = 0; i < 3; i++) {
      await call("update_page", REFUSED);
    }
    expect((await call("get_page", { page_id: "p1" }, false)).refused).toBe(false);
  });
});

describe("settled-question guard", () => {
  it("refuses a settled lookup on the third asking", async () => {
    const s = session();
    const call = { id: "c1", name: "search_tools_by_name", arguments: { query: "set datatype" } };
    expect(await s.before(call)).toBeUndefined();
    expect(await s.before(call)).toBeUndefined();
    const refusal = await s.before(call);
    expect(refusal?.block).toBe(true);
    expect(refusal?.reason).toContain("already answered");
    expect(refusal?.reason).toContain("fixed for this session");
    expect(s.g.guardOf("c1", "search_tools_by_name", false)).toBe("settled-question");
  });

  it("treats a different query as its own question", async () => {
    const s = session();
    for (const query of ["alpha", "beta", "gamma"]) {
      expect(
        await s.before({ id: query, name: "search_tools_by_name", arguments: { query } }),
      ).toBeUndefined();
    }
  });

  it("never refuses a call whose answer can change", async () => {
    const s = session();
    for (let i = 0; i < 12; i++) {
      expect(
        await s.before({ id: `j${i}`, name: "get_job_details", arguments: { dataset_id: "d1" } }),
      ).toBeUndefined();
      expect(
        await s.before({ id: `p${i}`, name: "update_page", arguments: { page_id: "p1" } }),
      ).toBeUndefined();
    }
  });
});

describe("galaxy-poll guard", () => {
  const WATCHED: Watched[] = [
    { kind: "dataset", id: "d1", label: "upload_file", state: "running" },
  ];
  const read = (name: string, args: Args) => ({ id: "c1", name, arguments: args });

  it("lets the first read of a watched resource through", async () => {
    const s = session({ watch: watchOf(WATCHED) });
    expect(await s.before(read("get_dataset_details", { dataset_id: "d1" }))).toBeUndefined();
  });

  it("refuses a second read inside the cooldown", async () => {
    const s = session({ watch: watchOf(WATCHED) });
    await s.before(read("get_dataset_details", { dataset_id: "d1" }));
    const refusal = await s.before(read("get_dataset_details", { dataset_id: "d1" }));
    expect(refusal?.block).toBe(true);
    expect(refusal?.reason).toContain("running");
    expect(refusal?.reason).toContain("background monitor is watching it");
    expect(s.g.guardOf("c1", "get_dataset_details", false)).toBe("galaxy-poll");
  });

  it("lets the read through again once the cooldown expires", async () => {
    const s = session({ watch: watchOf(WATCHED) });
    await s.before(read("get_dataset_details", { dataset_id: "d1" }));
    s.tick(120_000);
    expect(await s.before(read("get_dataset_details", { dataset_id: "d1" }))).toBeUndefined();
  });

  it("never holds a resource the watcher is not following", async () => {
    const s = session({ watch: watchOf(WATCHED) });
    for (let i = 0; i < 3; i++) {
      expect(
        await s.before(read("get_dataset_details", { dataset_id: "settled" })),
      ).toBeUndefined();
    }
  });

  it("cools each resource down on its own", async () => {
    const s = session({
      watch: watchOf([
        ...WATCHED,
        { kind: "dataset", id: "d2", label: "upload_file", state: "queued" },
      ]),
    });
    await s.before(read("get_dataset_details", { dataset_id: "d1" }));
    expect(await s.before(read("get_dataset_details", { dataset_id: "d2" }))).toBeUndefined();
    expect(await s.before(read("get_dataset_details", { dataset_id: "d1" }))).toBeDefined();
  });

  it("leaves a call that reads no watched resource alone", async () => {
    const s = session({ watch: watchOf(WATCHED) });
    expect(await s.before(read("get_history_contents", { history_id: "h1" }))).toBeUndefined();
    expect(await s.before(read("get_dataset_details", {}))).toBeUndefined();
  });

  it("cools the job behind a watched dataset down with it", async () => {
    const s = session({ watch: watchOf(WATCHED) });
    await s.before(read("get_dataset_details", { dataset_id: "d1" }));
    expect(await s.before(read("get_job_details", { dataset_id: "d1" }))).toBeDefined();
  });

  it("keys an invocation by its own argument", async () => {
    const s = session({
      watch: watchOf([{ kind: "invocation", id: "i1", label: "invoke_workflow", state: "new" }]),
    });
    await s.before(read("get_invocations", { invocation_id: "i1" }));
    expect(await s.before(read("get_invocations", { invocation_id: "i1" }))).toBeDefined();
  });
});

describe("work submitted in the same turn", () => {
  it("is watched as soon as it is submitted, not from the next turn", async () => {
    const watch = new Watch(async () => undefined);
    const s = session({ watch });
    // The upload landed earlier in this turn and registered its dataset.
    watch.add([{ kind: "dataset", id: "d5", label: "upload_file", state: "queued" }]);
    const read = { id: "c1", name: "get_dataset_details", arguments: { dataset_id: "d5" } };
    await s.before(read);
    expect(await s.before(read)).toBeDefined();
  });
});

describe("SRA gate wiring", () => {
  const TOOL = "toolshed.g2.bx.psu.edu/repos/iuc/sra_tools/fasterq_dump/3.1.1+galaxy1";
  const sra = (id: string, accession: string): Call => ({
    id,
    name: "run_tool",
    arguments: {
      history_id: "history-1",
      tool_id: TOOL,
      inputs: { "input|input_select": "accession_number", "input|accession": accession },
    },
  });

  it("refuses a fan-out before any of it runs, and lets the batch through", async () => {
    const s = session();
    const calls = [sra("a", "SRR1"), sra("b", "SRR2")];
    const message = assistant(calls);
    for (const call of calls) {
      const refusal = await s.before(call, message);
      expect(refusal?.block).toBe(true);
      expect(refusal?.reason).toContain("batch SRA imports");
      expect(s.g.guardOf(call.id, "run_tool", false)).toBe("sra-fan-out");
    }
    const corrected = sra("batch", "SRR1,SRR2");
    expect(await s.before(corrected)).toBeUndefined();
  });
});

describe("destructive gate wiring", () => {
  it("records a declined destructive call", async () => {
    const s = session({ ask: async () => false });
    const refusal = await s.before({
      id: "d",
      name: "update_history",
      arguments: { history_id: "h1", deleted: true },
    });
    expect(refusal?.reason).toContain("declined");
    expect(s.g.guardOf("d", "update_history", false)).toBe("destructive-declined");
  });
});

describe("oversized result", () => {
  it("discards an oversized result and says how to recover", async () => {
    const out = await session().after("x".repeat(256 * 1024 + 1), "run_python");
    const text = out!.content![0] as { text: string };
    expect(out!.isError).toBe(true);
    expect(text.text).not.toContain("x".repeat(100));
    expect(text.text).toContain("run_python");
    expect(text.text).toContain("narrow");
    expect(text.text).not.toContain("offset");
    expect(text.text).not.toContain("limit and page");
  });

  it("passes a result inside the budget through untouched", async () => {
    expect(await session().after("y".repeat(1000))).toBeUndefined();
  });
});

describe("secret redaction", () => {
  const SECRETS = ["fea4130124bb18ef", "sk-or-v1-9f3a2b7c4d1e"];

  it("never treats a short value as a secret", () => {
    expect(redact("abc appears often", ["abc"])).toBe("abc appears often");
  });

  it("uses loom's minimum length", () => {
    expect(redact("1234567 12345678", ["1234567", "12345678"])).toBe("1234567 [redacted]");
  });

  it("scrubs a key printed by a tool", () => {
    const out = redact("GALAXY_API_KEY=fea4130124bb18ef\nOPENAI=sk-or-v1-9f3a2b7c4d1e", SECRETS);
    expect(out).not.toContain("fea4130124bb18ef");
    expect(out).not.toContain("sk-or-v1-9f3a2b7c4d1e");
    expect(out.split("[redacted]").length - 1).toBe(2);
  });

  it("scrubs a longer key containing a shorter one whole", () => {
    expect(redact("token abcdefgh-ijklmnop here", ["abcdefgh", "abcdefgh-ijklmnop"])).toBe(
      "token [redacted] here",
    );
  });

  it("leaves ordinary output untouched", () => {
    expect(redact("133 lines written", SECRETS)).toBe("133 lines written");
  });

  it("scrubs a tool result before the model reads it", async () => {
    const out = await session({ secrets: SECRETS }).after("key fea4130124bb18ef");
    expect(out!.content).toEqual([{ type: "text", text: "key [redacted]" }]);
  });
});

describe("harmony control tokens", () => {
  it("names a tool without its control token", () => {
    expect(plainToolName("get_page<|channel|>commentary")).toBe("get_page");
    expect(plainToolName("search_tools_by_name<|channel|>commentary")).toBe("search_tools_by_name");
  });

  it("keeps a body's words while losing the token", () => {
    expect(withoutControlTokens("before<|channel|>final<|message|>after")).toBe("beforefinalafter");
    expect(withoutControlTokens("nothing to strip")).toBe("nothing to strip");
  });

  it("hints the advertised tool a contaminated name meant", () => {
    const advertised = ["get_page", "search_tools_by_name"];
    expect(notFoundHint("get_page<|channel|>commentary", advertised)).toBe(
      "Did you mean `get_page`?",
    );
    expect(notFoundHint("search_tools_by_name<|channel|>commentary", advertised)).toBe(
      "Did you mean `search_tools_by_name`?",
    );
  });

  it("leaves a trimmed name that matches nothing unknown", () => {
    expect(notFoundHint("not_a_tool<|channel|>commentary", ["get_page"])).toBeUndefined();
    expect(notFoundHint("totally_made_up", ["get_page"])).toBeUndefined();
  });

  it("names an unknown tool without its control token", () => {
    const name = "not_a_tool<|channel|>commentary";
    const [out] = session({ advertised: ["get_page"] }).g.convert([
      toolResult(name, `Tool ${name} not found`),
    ]);
    const text = resultOf(out).content[0].text;
    expect(text).not.toContain("<|");
    expect(text).toContain("not_a_tool");
    expect(resultOf(out).toolName).toBe("not_a_tool");
  });

  it("strips control tokens from a tool result", async () => {
    const out = await session().after("before<|channel|>final");
    expect(out!.content).toEqual([{ type: "text", text: "beforefinal" }]);
  });
});

describe("not-found hints", () => {
  const SNEAKY = "run_pythоn";

  it("resolves the observed lookalikes", () => {
    expect(notFoundHint(SNEAKY, ["finish", "run_python"])).toBe(
      "Did you mean `run_python`? The tool name you called contains Unicode confusables (visually similar non-Latin characters).",
    );
    expect(notFoundHint("searсh_tools_by_name", ["search_tools_by_name"])).toContain(
      "`search_tools_by_name`",
    );
    expect(notFoundHint("inτoke", ["intoke"])).toContain("`intoke`");
  });

  it("does not resolve a hallucinated name", () => {
    expect(notFoundHint("run_pythonn", ["run_python"])).toBeUndefined();
    expect(notFoundHint("totally_made_up", ["run_python"])).toBeUndefined();
  });

  it("finds no match without a candidate", () => {
    expect(notFoundHint(SNEAKY, ["finish"])).toBeUndefined();
  });

  it("is harmless on empty input", () => {
    expect(notFoundHint("", ["run_python"])).toBeUndefined();
  });

  it("appends the hint to pi's not-found result", () => {
    const g = session({ advertised: ["run_python"] }).g;
    const [out] = g.convert([toolResult(SNEAKY, `Tool ${SNEAKY} not found`)]);
    expect(resultOf(out).content[0].text).toBe(
      `Tool ${SNEAKY} not found\n\n${notFoundHint(SNEAKY, ["run_python"])}`,
    );
  });

  it("covers a lookalike process name", () => {
    expect(notFoundHint("р", ["p"])).toContain("`p`");
  });

  it("leaves an unknown name reported as unknown", () => {
    const message = toolResult("no_such_tool", "Tool no_such_tool not found");
    expect(session({ advertised: ["run_python"] }).g.convert([message])[0]).toEqual(message);
  });

  it("cannot reach a tool the session was not offered", () => {
    const g = session({ advertised: ["get_page"], withheld: new Map([["run_tool", "write"]]) }).g;
    const [out] = g.convert([toolResult("run_tоol", "Tool run_tоol not found")]);
    expect(resultOf(out).content[0].text).toBe("Tool run_tоol not found");
  });

  it("refuses a withheld tool by its capability", () => {
    const g = session({ withheld: new Map([["run_tool", "write"]]) }).g;
    const [out] = g.convert([toolResult("run_tool", "Tool run_tool not found")]);
    expect(resultOf(out).content[0].text).toBe(
      "Refused: 'run_tool' needs the 'write' capability, which is not granted in this session. " +
        "Tell the user, and stay within the tools you are offered.",
    );
    expect(g.guardOf("c1", "run_tool", true)).toBe("capability");
    expect(g.guardOf("c1", "run_tool", false)).toBeUndefined();
  });

  it("leaves a successful result alone", () => {
    const message = toolResult("run_tool", "Tool run_tool not found", false);
    expect(session().g.convert([message])[0]).toBe(message);
  });
});
