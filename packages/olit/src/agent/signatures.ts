/**
 * Gemini 3 signs each tool call (`extra_content.google.thought_signature`) and refuses a request
 * that replays a call of the current turn without its signature. pi-ai's chat-completions path
 * neither keeps the field nor sends it back, so it is recorded here off the stream, by tool call
 * id, and put back on the request.
 */

type Extra = Record<string, unknown>;

// Ids are unique per call; a long session must not grow this without bound.
const KEPT = 2000;
const extras = new Map<string, Extra>();
// Recordings still reading a stream; the next request waits for them.
const recording = new Set<Promise<void>>();

function remember(id: string, extra: Extra) {
  extras.delete(id);
  extras.set(id, extra);
  if (extras.size > KEPT) {
    extras.delete(extras.keys().next().value!);
  }
}

/** Every `extra_content` the streamed chunks attach to a tool call, by the call's id. */
export function readExtras(chunks: unknown[]): Map<string, Extra> {
  const found = new Map<string, Extra>();
  const ids = new Map<number, string>();
  const pending = new Map<number, Extra>();
  for (const chunk of chunks) {
    const choices = (chunk as { choices?: Array<{ delta?: { tool_calls?: unknown[] } }> })?.choices;
    for (const call of choices?.[0]?.delta?.tool_calls ?? []) {
      const {
        index = 0,
        id,
        extra_content,
      } = call as {
        index?: number;
        id?: string;
        extra_content?: Extra;
      };
      if (id) {
        ids.set(index, id);
      }
      if (extra_content) {
        pending.set(index, extra_content);
      }
      const known = ids.get(index);
      if (known && pending.has(index)) {
        found.set(known, pending.get(index)!);
      }
    }
  }
  return found;
}

async function record(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const chunks: unknown[] = [];
  let buffer = "";
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop()!;
      for (const line of lines) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (data && data !== "[DONE]") {
          try {
            chunks.push(JSON.parse(data));
          } catch {
            // Not a chunk this cares about.
          }
        }
      }
      if (done) {
        break;
      }
    }
  } catch {
    // An aborted stream keeps what it already carried.
  }
  readExtras(chunks).forEach((extra, id) => remember(id, extra));
}

/** A fetch that records the signatures a streamed reply carries, leaving the reply untouched. */
export function recordingSignatures(send: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await send(input, init);
    const streamed = response.headers.get("content-type")?.includes("event-stream");
    if (!response.ok || !streamed || !response.body) {
      return response;
    }
    const [reply, copy] = response.body.tee();
    const done = record(copy).finally(() => recording.delete(done));
    recording.add(done);
    return new Response(reply, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/** The request with each replayed tool call carrying the `extra_content` it arrived with. */
export async function replaySignatures<T>(params: T): Promise<T> {
  await Promise.all(recording);
  const messages = (params as { messages?: unknown[] })?.messages;
  for (const message of messages ?? []) {
    const calls = (message as { tool_calls?: Array<{ id?: string; extra_content?: Extra }> })
      .tool_calls;
    for (const call of calls ?? []) {
      const extra = call.id ? extras.get(call.id) : undefined;
      if (extra && !call.extra_content) {
        call.extra_content = extra;
      }
    }
  }
  return params;
}
