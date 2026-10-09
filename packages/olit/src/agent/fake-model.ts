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

/** A saved visualization as Galaxy keeps it: its config, and the user who owns it. */
export interface VisualizationRow {
  title?: string;
  type?: string;
  config?: unknown;
  owner?: string;
}

/**
 * Galaxy's visualizations, kept in memory, each owned by the signed-in user `me` who saved it.
 * `answer` serves a request under `api/visualizations` or `api/users/current`, else undefined.
 */
export function visualizationStore(me: string | null) {
  const rows = new Map<string, VisualizationRow>();
  let next = 1;
  async function answer(request: Request): Promise<Response | undefined> {
    if (request.url.endsWith("/api/users/current")) {
      return json(me ? { id: me } : { username: "Anonymous" });
    }
    if (!request.url.includes("/api/visualizations")) return undefined;
    const id = request.url.split("/api/visualizations/")[1];
    if (request.method === "GET") {
      const row = rows.get(id!);
      return row
        ? json({ user_id: row.owner, latest_revision: { config: row.config } })
        : json("not found", 404);
    }
    const body = JSON.parse(await request.text());
    if (request.method === "POST") {
      const created = `v${next++}`;
      rows.set(created, { ...body, owner: me ?? undefined });
      return json({ id: created });
    }
    rows.set(id!, { ...rows.get(id!), ...body });
    return json({});
  }
  return { rows, answer };
}
