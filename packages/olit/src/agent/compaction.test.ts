import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import {
  compactionSettings,
  compactor,
  contextTokens,
  findCutIndex,
  serialize,
  type CompactionSettings,
} from "./compaction";
import { estimateMessageTokens } from "@earendil-works/pi-ai/utils/estimate";
import { toChat, toLlm, type ChatMessage as Message } from "./messages";

/** pi's estimate for a chat-shaped fixture. */
const estimateTokens = (m: Message) => estimateMessageTokens(toPi([m])[0] as never);

/** Chat-shaped fixtures as pi messages. */
const toPi = (messages: Message[]): AgentMessage[] =>
  messages.map(
    (m) =>
      (m.role === "assistant"
        ? {
            role: "assistant",
            content: [
              ...(m.reasoning_content || m.reasoning
                ? [{ type: "thinking", thinking: m.reasoning_content || m.reasoning }]
                : []),
              ...(m.content ? [{ type: "text", text: m.content }] : []),
              ...(m.tool_calls ?? []).map((c) => ({
                type: "toolCall",
                id: c.id,
                name: c.function.name,
                arguments: JSON.parse(c.function.arguments || "{}"),
              })),
            ],
            stopReason: m.tool_calls?.length ? "toolUse" : "stop",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
            timestamp: 0,
          }
        : m.role === "tool"
          ? {
              role: "toolResult",
              toolCallId: m.tool_call_id ?? "",
              toolName: m.name ?? "",
              content: [{ type: "text", text: m.content ?? "" }],
              isError: false,
              timestamp: 0,
            }
          : { role: m.role, content: m.content ?? "", timestamp: 0 }) as unknown as AgentMessage,
  );

const SUMMARY_PREFIX =
  "The conversation history before this point was compacted into the following summary:";
const FIRST_PROMPT = "The messages above are a conversation to summarize.";
const UPDATE_PROMPT = "The messages above are NEW conversation messages to incorporate";

const settings = (
  overrides: Partial<Parameters<typeof compactionSettings>[0]> = {},
): CompactionSettings =>
  compactionSettings({
    contextWindow: 1000,
    reserveTokens: 200,
    keepRecentTokens: 200,
    ...overrides,
  });

const user = (text: string): Message => ({ role: "user", content: text });
const system = (text: string): Message => ({ role: "system", content: text });
const assistant = (text: string | null, calls: Array<[string, string]> = []): Message => ({
  role: "assistant",
  content: text,
  ...(calls.length
    ? {
        tool_calls: calls.map(([name, args], i) => ({
          id: `c${i}`,
          function: { name, arguments: args },
        })),
      }
    : {}),
});
const tool = (text: string): Message => ({
  role: "tool",
  tool_call_id: "c0",
  name: "t",
  content: text,
});

const longUsers = (n: number) => Array.from({ length: n }, () => user("x".repeat(4000)));

/** Stands in for the provider on the summarization call. */
function summarizer(summary = "## Goal\nfinish the analysis") {
  const prompts: Array<{ system: string; prompt: string; signal?: AbortSignal }> = [];
  const summarize = async (system: string, prompt: string, signal?: AbortSignal) => {
    prompts.push({ system, prompt, signal });
    return summary;
  };
  return { summarize, prompts };
}

const textOf = (m: AgentMessage) => {
  const content = (m as { content: unknown }).content;
  return typeof content === "string"
    ? content
    : (content as Array<{ text?: string }>).map((c) => c.text).join("");
};

describe("settings", () => {
  it("clamps keep-recent to what the window holds", () => {
    const s = compactionSettings({ contextWindow: 32000 });
    expect(s.keepRecentTokens).toBeLessThanOrEqual(s.contextWindow - s.reserveTokens);
    expect(s.keepRecentTokens).toBeLessThan(20000);
  });

  it("leaves pi's defaults alone for a generous window", () => {
    const s = compactionSettings({ contextWindow: 200000 });
    expect(s.reserveTokens).toBe(16384);
    expect(s.keepRecentTokens).toBe(20000);
    expect(s.enabled).toBe(true);
  });
});

describe("trigger", () => {
  it("fires over the window minus the reserve", async () => {
    const under = await compactor(settings(), summarizer().summarize).compact(
      toPi([user("x".repeat(799 * 4))]),
    );
    const over = await compactor(settings(), summarizer().summarize).compact(
      toPi([user("x".repeat(801 * 4))]),
    );
    expect(under.status).toBe("not_needed");
    expect(over.status).not.toBe("not_needed");
  });

  it("can be turned off", async () => {
    const llm = summarizer();
    const result = await compactor(settings({ enabled: false }), llm.summarize).compact(
      toPi([system("s"), ...longUsers(30)]),
    );
    expect(result.status).toBe("not_needed");
    expect(llm.prompts).toEqual([]);
  });
});

describe("token counts", () => {
  it("prefers the provider's own count to the estimate", () => {
    const messages = toPi([user("tiny"), assistant("also tiny")]);
    expect(contextTokens(messages)).toBeLessThan(100);
    (messages[1] as { usage: { totalTokens: number } }).usage = { totalTokens: 21000 } as never;
    expect(contextTokens(messages)).toBe(21000);
  });

  it("estimates messages added after the measurement on top", () => {
    const after = tool("c".repeat(4000));
    const messages = toPi([user("a"), assistant("b"), after]);
    (messages[1] as { usage: { totalTokens: number } }).usage = { totalTokens: 1000 } as never;
    expect(contextTokens(messages)).toBe(1000 + estimateTokens(after));
  });

  it("counts tool-call arguments, not just content", () => {
    expect(
      estimateTokens(assistant("", [["run_tool", '{"history_id": "abcdef"}']])),
    ).toBeGreaterThan(0);
  });

  it.each(["reasoning_content", "reasoning"] as const)("counts reasoning spelled %s", (key) => {
    const message = { ...assistant(null, [["get_histories", "{}"]]), [key]: "x".repeat(4000) };
    expect(estimateTokens(message)).toBeGreaterThanOrEqual(1000);
  });

  it("estimates close to what the request carries", () => {
    const message = {
      ...assistant(null, [["get_histories", "{}"]]),
      reasoning_content: "think. ".repeat(1600),
    };
    const sent = Math.floor(JSON.stringify(message).length / 4);
    expect(Math.abs(estimateTokens(message) - sent) / sent).toBeLessThan(0.1);
  });

  it("asks to compact a transcript that is mostly reasoning", () => {
    const s = compactionSettings({ contextWindow: 8000, reserveTokens: 1000 });
    const messages = toPi([
      user("go"),
      { ...assistant(null, [["get_histories", "{}"]]), reasoning_content: "x".repeat(40000) },
    ]);
    expect(contextTokens(messages)).toBeGreaterThan(s.contextWindow - s.reserveTokens);
  });
});

describe("findCutIndex", () => {
  it("never begins the kept tail at a tool result", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 40; i++) {
      messages.push(user(`ask ${i}`), assistant("", [["t", "{}"]]), tool("y".repeat(4000)));
    }
    const pi = toPi(messages);
    const cut = findCutIndex(pi, 200)!;
    expect(["user", "assistant"]).toContain(pi[cut].role);
  });

  it("keeps tool results with their call when cutting at an assistant", () => {
    const pi = toPi([
      user("old"),
      assistant("", [["t", "{}"]]),
      tool("small"),
      user(`recent ${"z".repeat(4000)}`),
    ]);
    const kept = pi.slice(findCutIndex(pi, 200));
    kept.forEach((m, i) => {
      if (m.role === "toolResult") {
        expect(kept[i - 1].role).toBe("assistant");
      }
    });
  });

  it("has no cut without a user or assistant message", () => {
    expect(findCutIndex(toPi([tool("x")]), 200)).toBeUndefined();
  });
});

describe("serialize", () => {
  it("renders the conversation as text rather than replaying it", () => {
    const text = serialize([
      user("hello"),
      assistant("hi", [["run_tool", '{"a":1}']]),
      tool("result"),
    ]);
    expect(text).toContain("[User]: hello");
    expect(text).toContain("[Assistant]: hi");
    expect(text).toContain("[Assistant tool calls]: run_tool");
    expect(text).toContain("[Tool result]: result");
  });

  it("truncates a huge tool result", () => {
    const text = serialize([tool("q".repeat(5000))]);
    expect(text).toContain("more characters truncated");
    expect(text.length).toBeLessThan(5000);
  });
});

describe("compact", () => {
  const conversation = () => toPi([system("identity"), ...longUsers(30)]);

  it("replaces history with a summary message", async () => {
    const llm = summarizer();
    const { messages, status } = await compactor(settings(), llm.summarize).compact(conversation());
    expect(status).toBe("compacted");
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toMatchObject({
      role: "compactionSummary",
      summary: "## Goal\nfinish the analysis",
    });
    expect(messages.length).toBeLessThan(31);
    // The model reads it as the user turn that carries it.
    const [read] = toLlm([messages[1]]);
    expect(read.role).toBe("user");
    expect(textOf(read as AgentMessage).startsWith(SUMMARY_PREFIX)).toBe(true);
    expect(toChat([messages[1]])[0]).toMatchObject({ role: "user" });
  });

  it("updates a summary an earlier turn left, which it finds by kind, not by wording", async () => {
    // Each turn compacts with a compactor of its own: the transcript is all that carries over.
    const first = await compactor(settings(), summarizer().summarize).compact(conversation());
    const later = summarizer("## Goal\nnext");
    const { status } = await compactor(settings(), later.summarize).compact([
      ...first.messages,
      ...toPi(longUsers(30)),
    ]);
    expect(status).toBe("compacted");
    expect(later.prompts[0].prompt).toContain(
      "<previous-summary>\n## Goal\nfinish the analysis\n</previous-summary>",
    );
    // Updated once, not also summarized as though someone had said it.
    expect(later.prompts[0].prompt).not.toContain("[User]: The conversation history");
  });

  it("never summarizes the system message", async () => {
    const llm = summarizer();
    const { messages } = await compactor(settings(), llm.summarize).compact(conversation());
    expect(textOf(messages[0])).toBe("identity");
    expect(llm.prompts[0].prompt).not.toContain("identity");
  });

  it("keeps pi's record of the tools, wherever it sits in what is summarized", async () => {
    const declared = {
      role: "system",
      content: "",
      toolsAdded: [{ name: "get_histories", description: "", parameters: {} }],
      timestamp: 0,
    } as unknown as AgentMessage;
    const [identity, ...rest] = conversation();
    const { messages, status } = await compactor(settings(), summarizer().summarize).compact([
      identity,
      declared,
      ...rest,
    ]);
    expect(status).toBe("compacted");
    // Without it pi offers the model no tools on the next request.
    expect(messages).toContain(declared);
  });

  it("summarizes nothing when the prompt alone overflows, and says it cannot help", async () => {
    const llm = summarizer();
    const messages = toPi([
      system("x".repeat(4000 * 4)),
      user("hi"),
      assistant("ok"),
      user("again"),
    ]);
    const { messages: out, status } = await compactor(
      settings({ contextWindow: 4000, reserveTokens: 100 }),
      llm.summarize,
    ).compact(messages);
    expect(status).toBe("impossible");
    expect(out).toEqual(messages);
    expect(llm.prompts).toHaveLength(0);
  });

  it("uses the initial prompt the first time", async () => {
    const llm = summarizer();
    await compactor(settings(), llm.summarize).compact(conversation());
    expect(llm.prompts).toHaveLength(1);
    expect(llm.prompts[0].system).toContain("context summarization assistant");
    expect(llm.prompts[0].prompt.startsWith("<conversation>\n[User]: ")).toBe(true);
    expect(llm.prompts[0].prompt).toContain(FIRST_PROMPT);
    expect(llm.prompts[0].prompt).not.toContain("<previous-summary>");
  });

  it("updates the previous summary on a later compaction", async () => {
    const llm = summarizer();
    const c = compactor(settings(), llm.summarize);
    const messages = conversation();
    await c.compact(messages);
    messages.push(...toPi(longUsers(30)));
    const { status } = await c.compact(messages);
    expect(status).toBe("compacted");
    expect(llm.prompts[1].prompt).toContain(
      "<previous-summary>\n## Goal\nfinish the analysis\n</previous-summary>",
    );
    expect(llm.prompts[1].prompt).toContain(UPDATE_PROMPT);
  });

  it("reuses the summary until the window fills again", async () => {
    const llm = summarizer();
    const c = compactor(settings(), llm.summarize);
    const messages = toPi([
      system("s"),
      ...Array.from({ length: 30 }, () => user("x".repeat(400))),
    ]);
    const first = await c.compact(messages);
    expect(first.status).toBe("compacted");
    messages.push(...toPi([user("next")]));
    const again = await c.compact(messages);
    expect(again.status).toBe("not_needed");
    expect(llm.prompts).toHaveLength(1);
    expect(again.messages).toEqual([...first.messages, messages[messages.length - 1]]);
    expect(c.reduce(messages)).toEqual(again.messages);
  });

  it("leaves a transcript without the kept message alone", () => {
    const messages = conversation();
    expect(compactor(settings(), summarizer().summarize).reduce(messages)).toBe(messages);
  });

  it("passes the abort signal to the summarizer", async () => {
    const llm = summarizer();
    const signal = new AbortController().signal;
    await compactor(settings(), llm.summarize).compact(conversation(), signal);
    expect(llm.prompts[0].signal).toBe(signal);
  });

  it("leaves the conversation intact on an empty summary", async () => {
    const messages = conversation();
    const result = await compactor(settings(), summarizer("   ").summarize).compact(messages);
    expect(result.status).toBe("impossible");
    expect(result.messages).toBe(messages);
  });

  it("returns a short conversation untouched at no cost", async () => {
    const llm = summarizer();
    const messages = toPi([system("s"), user("hi")]);
    const result = await compactor(settings(), llm.summarize).compact(messages);
    expect(result.status).toBe("not_needed");
    expect(result.messages).toBe(messages);
    expect(llm.prompts).toEqual([]);
  });

  it("reports being over budget with nothing to summarize", async () => {
    const llm = summarizer();
    const messages = toPi([system("x".repeat(40000)), user("hi")]);
    const result = await compactor(settings(), llm.summarize).compact(messages);
    expect(result.status).toBe("impossible");
    expect(result.messages).toBe(messages);
    expect(llm.prompts).toEqual([]);
  });

  it("leaves a conversation with nowhere lawful to cut alone", async () => {
    const messages = toPi([system("s"), user("x".repeat(4000))]);
    const result = await compactor(settings(), summarizer().summarize).compact(messages);
    expect(result.status).toBe("impossible");
    expect(result.messages).toBe(messages);
  });
});
