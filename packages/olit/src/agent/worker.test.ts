import { MemoryStorage } from "@earendil-works/pi-durable";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { json, stream, toolCall } from "./fake-model";
import { probeWindow } from "./providers";
import type { PageMessage, WorkerMessage } from "./worker";

vi.mock("./storage", () => ({
  openStorage: async () => ({ storage: new MemoryStorage() }),
  holdStorage: async () => {},
}));
vi.mock("./python", async (original) => ({
  ...(await original<typeof import("./python")>()),
  browserPython: () => ({
    run: async () => "",
    write: async () => {},
    read: async () => undefined,
  }),
}));

const ROOT = "http://galaxy.test/";
const LLM = "http://llm.test/v1";
const LOCAL = "http://local.test/v1";

const deleteHistory = () => toolCall("update_history", { history_id: "h1", deleted: true });

/** What the model was asked, the request bodies in turn. */
const asked: string[] = [];
/** The model's next answers, in turn; then it just says it is done. */
const answers: Array<() => Response> = [];
/** A local server that says nothing about its window until released. */
let releaseProps: () => void = () => {};

const posted: WorkerMessage[] = [];

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url.endsWith("/props")) {
      return new Promise<Response>((resolve) => (releaseProps = () => resolve(json({}))));
    }
    if (request.url.startsWith(LLM) || request.url.startsWith(LOCAL)) {
      asked.push(await request.text());
      return (answers.shift() ?? (() => stream({ content: "done" }, "stop")))();
    }
    if (request.url.endsWith("api/users/current")) return json({ id: "u1" });
    if (request.url.endsWith("api/version")) return json({ version_major: "26.1" });
    if (request.url.includes("api/pages")) return json([]);
    return json({});
  });
  vi.spyOn(self, "postMessage").mockImplementation(((message: WorkerMessage) => {
    posted.push(message);
  }) as typeof self.postMessage);
  await import("./worker");
  send({
    type: "open",
    request: {
      pyodideURL: "http://galaxy.test/pyodide/",
      config: { galaxy_root: ROOT, ai_base_url: LLM, ai_model: "m", ai_api_key: "k" },
      placement: { historyId: "h1" },
    },
  });
  await until(() => posted.some((m) => m.type === "ready"));
});

afterAll(() => vi.unstubAllGlobals());

function send(message: PageMessage) {
  (self.onmessage as (e: MessageEvent<PageMessage>) => void)({ data: message } as MessageEvent);
}

async function until(done: () => boolean) {
  for (let i = 0; i < 300 && !done(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(done()).toBe(true);
}

let request = 1000;
async function exported() {
  const id = request++;
  send({ type: "export", id, title: "" });
  await until(() => posted.some((m) => m.type === "reply" && m.id === id));
  const reply = posted.find((m) => m.type === "reply" && m.id === id) as { value: any };
  return reply.value;
}

describe("the worker's order", () => {
  it("puts a message sent during a reset into the new conversation", async () => {
    const before = await exported();
    send({ type: "reset" });
    send({ type: "submit", text: "the first words of the new conversation" });
    const after = await exported();
    expect(after.session.id).not.toBe(before.session.id);
    expect(JSON.stringify(after.entries)).toContain("the first words of the new conversation");
  });

  it("releases a waiting confirmation at Stop, while a slower message is still in order", async () => {
    answers.push(deleteHistory);
    send({ type: "submit", text: "delete my history" });
    await until(() => posted.some((m) => m.type === "confirm"));

    const switched = request++;
    send({ type: "switch", id: switched, config: { ai_provider: "ollama", ai_base_url: LOCAL } });
    send({ type: "stop" });
    const settled = () =>
      posted.some(
        (m) => m.type === "events" && m.events.some((e) => e.type === "tool_execution_end"),
      );
    await until(settled);
    expect(posted.some((m) => m.type === "reply" && m.id === switched)).toBe(false);
    const confirmation = posted.find((m) => m.type === "confirm") as { id: number };
    expect(posted).toContainEqual({ type: "withdrawn", id: confirmation.id });
    releaseProps();
  });
});

describe("the window probe", () => {
  it("gives up on a server that never answers", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("timeout"))),
        ),
    );
    expect(await probeWindow("http://local.test/v1", 20)).toBeUndefined();
  });
});
