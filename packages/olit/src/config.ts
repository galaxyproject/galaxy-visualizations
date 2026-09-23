/** The brain's config, assembled from the Charts incoming contract and dev env vars. */
import { parseIncoming } from "./incoming";
import { providerById, type Credentials } from "./credentials";

const PLUGIN_NAME = "olit";

export function buildConfig(incoming: ReturnType<typeof parseIncoming>, creds?: Credentials | null) {
    const picked = creds ? providerById(creds.provider) : undefined;
    return {
        // Dev routes through the vite proxy; a picked provider carries its own base URL;
        // with neither, the Galaxy chat proxy answers.
        // A typed endpoint wins over the provider's own: it is how a self-hosted server is reached.
        ai_base_url:
            (process.env.llm_base_url as string) ||
            creds?.baseUrl?.trim() ||
            picked?.base_url ||
            `${incoming.root}api/plugins/${PLUGIN_NAME}`,
        ai_provider: creds?.provider || (process.env.llm_provider as string) || "galaxy",
        ai_model: creds?.model || (process.env.llm_model as string) || undefined,
        ai_context_window: Number(process.env.llm_context_window) || undefined,
        ai_keep_recent_tokens: Number(process.env.llm_keep_recent_tokens) || undefined,
        galaxy_root: incoming.root,
        history_id: incoming.historyId,
        dataset_id: incoming.datasetId,
    };
}
