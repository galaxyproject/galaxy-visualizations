/** The shape a Galaxy tool answers in: `{data, message, pagination}`, optionally followed by a
 * hint paragraph. An Olit tool that is not a Galaxy operation answers with its own object. */

/** The object a tool result opens with, or undefined. */
export function toolPayload(content: string): Record<string, unknown> | undefined {
  const parsed = leadingObject(content);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

/** The envelope's `data`, or undefined when there is no envelope. */
export function galaxyData(content: string): unknown {
  const payload = toolPayload(content);
  return payload && "data" in payload ? payload.data : undefined;
}

/** The envelope's `data` when it is a single object. */
export function galaxyObject(content: string): Record<string, any> | undefined {
  const data = galaxyData(content);
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, any>)
    : undefined;
}

/** The JSON value the content starts with, ignoring anything appended after it. */
function leadingObject(content: string): unknown {
  if (typeof content !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(content);
  } catch {
    // A hint paragraph may follow the JSON; parse up to where the object closes.
  }
  const end = objectEnd(content);
  if (end < 0) {
    return undefined;
  }
  try {
    return JSON.parse(content.slice(0, end + 1));
  } catch {
    return undefined;
  }
}

/** Index of the brace closing the object the content opens with, or -1. */
function objectEnd(content: string): number {
  const start = content.indexOf("{");
  if (start !== 0) {
    return -1;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (escaped) {
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString && ch === "{") {
      depth++;
    } else if (!inString && ch === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}
