import { describe, expect, it } from "vitest";

import { readExtras, recordingSignatures, replaySignatures } from "./signatures";

const SIGNED = { google: { thought_signature: "sig-1" } };

const sse = (chunks: unknown[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  });

const delta = (call: Record<string, unknown>) => ({
  choices: [{ index: 0, delta: { tool_calls: [{ index: 0, ...call }] } }],
});

describe("readExtras", () => {
  it("keys a call's extra_content by its id, whichever chunk carries each", () => {
    const found = readExtras([
      delta({ id: "call_a", function: { name: "get_histories", arguments: "" } }),
      delta({ function: { arguments: "{}" }, extra_content: SIGNED }),
    ]);
    expect(found.get("call_a")).toEqual(SIGNED);
  });

  it("finds nothing in a reply that signs nothing", () => {
    expect(
      readExtras([delta({ id: "call_b", function: { name: "x", arguments: "{}" } })]).size,
    ).toBe(0);
  });
});

describe("recordingSignatures", () => {
  it("hands the reply on unchanged and replays the signature on the next request", async () => {
    const chunks = [
      delta({ id: "call_c", function: { name: "x", arguments: "{}" }, extra_content: SIGNED }),
    ];
    const send = recordingSignatures((async () => sse(chunks)) as typeof fetch);
    const reply = await send("http://llm");
    expect(await reply.text()).toContain('"call_c"');

    const request = {
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          tool_calls: [{ id: "call_c", type: "function", function: { name: "x" } }],
        },
        {
          role: "assistant",
          tool_calls: [{ id: "call_unknown", type: "function", function: { name: "y" } }],
        },
      ],
    };
    const signed = await replaySignatures(request);
    expect(signed.messages[1].tool_calls![0]).toHaveProperty("extra_content", SIGNED);
    expect(signed.messages[2].tool_calls![0]).not.toHaveProperty("extra_content");
  });

  it("leaves a reply that is not a stream alone", async () => {
    const plain = new Response("{}", { headers: { "content-type": "application/json" } });
    const send = recordingSignatures((async () => plain) as typeof fetch);
    expect(await send("http://llm")).toBe(plain);
  });
});
