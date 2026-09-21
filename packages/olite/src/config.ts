/** The brain's config, assembled from the plugin manifest and dev env vars. */
import { parseIncoming } from "./incoming";
import { providerById, type Credentials } from "./credentials";

const PLUGIN_NAME = "olite";

/** The capabilities the manifest grants; absent means the brain's read-only default. */
function capabilities(spec: unknown): string[] | undefined {
    if (typeof spec !== "string") return undefined;
    const names = spec.split(",").map((s) => s.trim()).filter(Boolean);
    return names.length ? names : undefined;
}

export function buildConfig(incoming: ReturnType<typeof parseIncoming>, creds?: Credentials | null) {
    const s = incoming.specs;
    const picked = creds ? providerById(creds.provider) : undefined;
    return {
        // Dev routes through the vite proxy; a picked provider carries its own base URL;
        // with neither, the Galaxy chat proxy answers.
        ai_base_url:
            (process.env.llm_base_url as string) || picked?.base_url || `${incoming.root}api/plugins/${PLUGIN_NAME}`,
        ai_provider: creds?.provider || (process.env.llm_provider as string) || "galaxy",
        ai_model: creds?.model || (process.env.llm_model as string) || undefined,
        ai_context_window: Number(process.env.llm_context_window) || undefined,
        ai_keep_recent_tokens: Number(process.env.llm_keep_recent_tokens) || undefined,
        galaxy_root: incoming.root,
        history_id: incoming.historyId,
        dataset_id: incoming.datasetId,
        galaxy_key: s.galaxy_api_key,
        capabilities: capabilities(s.capabilities),
    };
}
