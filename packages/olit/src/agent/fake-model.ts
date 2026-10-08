/**
 * For tests: what a model and Galaxy answer when a test scripts them. A model's reply streams as
 * an OpenAI-compatible endpoint streams it, and reports 10 prompt and 5 completion tokens.
 */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const stream = (delta: Record<string, unknown>, finish: string) =>
  new Response(
    [
      { choices: [{ index: 0, delta }] },
      {
        choices: [{ index: 0, delta: {}, finish_reason: finish }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    ]
      .map((c) => `data: ${JSON.stringify(c)}\n\n`)
      .join("") + "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );

/** A reply in words. */
export const text = (content: string) => stream({ content }, "stop");

/** A reply that calls one tool. */
export const toolCall = (name: string, args: Record<string, unknown>) =>
  stream(
    {
      tool_calls: [
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
    "tool_calls",
  );

/** Never answers; ends only when its request is aborted. */
export const hanging = (request: Request) =>
  new Promise<Response>((_, reject) =>
    request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }),
  );
