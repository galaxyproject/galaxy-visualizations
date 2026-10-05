/** Ask an endpoint which models it serves, so a catalog we cannot know is not guessed. */

import type { Provider } from "./agent/providers";

export interface Discovery {
  models: string[];
  error?: string;
}

/** Where the model list hangs off an OpenAI-compatible base URL. */
export function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

/**
 * Ids out of a model list, sorted and deduplicated: OpenAI's `{data:[{id}]}`, or Gemini's
 * native `{models:[{name:"models/<id>"}]}`.
 */
export function modelIds(body: unknown): string[] {
  const { data, models } = (body ?? {}) as { data?: unknown; models?: unknown };
  const ids = Array.isArray(data)
    ? data.map((m) => (m as { id?: unknown })?.id)
    : Array.isArray(models)
      ? models.map((m) => {
          const name = (m as { name?: unknown })?.name;
          return typeof name === "string" ? name.replace(/^models\//, "") : undefined;
        })
      : [];
  return [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ].sort();
}

/**
 * What to tell the user when the list could not be fetched.
 *
 * A failure here is worth surfacing rather than swallowing: the same request
 * shape carries every turn, so whatever blocks this blocks the conversation too.
 */
export function discoveryError(status: number): string {
  if (status === 401 || status === 403) return "The endpoint rejected that key.";
  if (status === 404) return "That endpoint serves no model list; type the model name instead.";
  return `The endpoint answered ${status}.`;
}

export async function discoverModels(
  fetchImpl: typeof fetch,
  provider: Provider,
  baseUrl: string,
  apiKey?: string,
): Promise<Discovery> {
  const headers: Record<string, string> = { ...(provider.headers || {}) };
  // Gemini's native API takes its key in its own header; everyone else takes a bearer token.
  if (apiKey && provider.api === "google-generative-ai") headers["x-goog-api-key"] = apiKey;
  else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const res = await fetchImpl(modelsUrl(baseUrl), { headers });
    if (!res.ok) return { models: [], error: discoveryError(res.status) };
    return { models: modelIds(await res.json()) };
  } catch {
    // A blocked cross-origin request throws rather than answering, and so will every turn.
    return { models: [], error: "Could not reach that endpoint from this browser." };
  }
}
