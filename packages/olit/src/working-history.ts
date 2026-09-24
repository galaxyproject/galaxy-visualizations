/** The history the agent is working in, read from what Galaxy returns to a tool call.
 *
 * A session opened without a history in its URL still ends up in one, because the agent
 * creates or picks it. Learning it here is what lets a saved session name the history it
 * operated on.
 */

/** Where a Galaxy result carries the history a call acted on. */
const LISTS = ["outputs", "jobs", "items"];

export function historyFromResult(name: string, content: string): string | undefined {
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  // A created history answers with its own id rather than naming one.
  if (payload.model_class === "History" && typeof payload.id === "string") {
    return payload.id;
  }
  if (typeof payload.history_id === "string") {
    return payload.history_id;
  }
  for (const key of LISTS) {
    const first = Array.isArray(payload[key]) ? payload[key][0] : undefined;
    if (first && typeof first.history_id === "string") {
      return first.history_id;
    }
  }
  return undefined;
}
