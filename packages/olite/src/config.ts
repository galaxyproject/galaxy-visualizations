/** The brain's config, assembled from the plugin manifest and dev env vars. */
import { parseIncoming } from "./incoming";
import { providerById, type Credentials } from "./credentials";

const PLUGIN_NAME = "olite";

export function buildConfig(incoming: ReturnType<typeof parseIncoming>, creds?: Credentials | null) {
    const s = incoming.specs;
    const picked = creds ? providerById(creds.provider) : undefined;
    return {
        // A picked provider carries its own base URL from the registry; falling
        // back to the specs keeps the Galaxy proxy working when none is chosen.
        ai_base_url:
            (process.env.llm_base_url as string) ||
            picked?.base_url ||
            s.ai_api_base_url ||
            `${incoming.root}api/plugins/${PLUGIN_NAME}`,
        // Client-held, from sessionStorage. Never read back into the plugin
        // specs, which Galaxy persists server-side.
        ai_api_key: creds?.apiKey || s.ai_api_key,
        // Names a built-in provider, so the brain gets its limits and context window.
        ai_provider:
            creds?.provider ||
            (process.env.llm_provider as string) ||
            (s.ai_api_base_url ? undefined : "galaxy"),
        // Dev only: switch model by env instead of editing a committed file.
        ai_model: creds?.model || (process.env.llm_model as string) || s.ai_model,
        // Only for an endpoint the provider registry does not know.
        ai_context_window: Number(process.env.llm_context_window) || undefined,
        ai_keep_recent_tokens: Number(process.env.llm_keep_recent_tokens) || undefined,
        galaxy_root: incoming.root,
        history_id: incoming.historyId,
        galaxy_key: s.galaxy_api_key,
        // Demo grants write; real deployments gate it via the install/trust tier.
        capabilities: ["llm", "local", "read", "write"],
    };
}
