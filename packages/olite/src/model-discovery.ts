/** Ask an endpoint which models it serves, so a catalog we cannot know is not guessed. */

import type { ProviderInfo } from "./credentials";

export interface Discovery {
    models: string[];
    error?: string;
}

/** Where the model list hangs off an OpenAI-compatible base URL. */
export function modelsUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/+$/, "")}/models`;
}

/** Ids out of an OpenAI-shaped `{data:[{id}]}` body, sorted and deduplicated. */
export function modelIds(body: unknown): string[] {
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];
    const ids = data
        .map((m) => (m as { id?: unknown })?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
    return [...new Set(ids)].sort();
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
    provider: ProviderInfo,
    baseUrl: string,
    apiKey?: string,
): Promise<Discovery> {
    const headers: Record<string, string> = { ...(provider.headers || {}) };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    try {
        const res = await fetchImpl(modelsUrl(baseUrl), { headers });
        if (!res.ok) return { models: [], error: discoveryError(res.status) };
        return { models: modelIds(await res.json()) };
    } catch {
        // A blocked cross-origin request throws rather than answering, and so will every turn.
        return { models: [], error: "Could not reach that endpoint from this browser." };
    }
}
