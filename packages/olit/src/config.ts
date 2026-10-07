/** The agent's config, assembled from the Charts incoming contract and dev env vars. */
import { parseIncoming } from "./incoming";
import { providerById } from "./agent/providers";
import type { Credentials } from "./credentials";

const PLUGIN_NAME = "olit";

export function buildConfig(
  incoming: ReturnType<typeof parseIncoming>,
  creds?: Credentials | null,
) {
  const picked = creds ? providerById(creds.provider) : undefined;
  const provider = creds?.provider || (process.env.llm_provider as string) || "galaxy";
  return {
    // Dev routes through the vite proxy; a provider Olit defines carries its own base URL and
    // one pi defines is reached at pi's; the Galaxy chat proxy answers at the plugin's route.
    // A typed endpoint wins over the provider's own: it is how a self-hosted server is reached.
    ai_base_url:
      (process.env.llm_base_url as string) ||
      creds?.baseUrl?.trim() ||
      picked?.baseUrl ||
      (provider === "galaxy" ? `${incoming.root}api/plugins/${PLUGIN_NAME}` : undefined),
    ai_provider: provider,
    ai_model: creds?.model || (process.env.llm_model as string) || undefined,
    ai_context_window: Number(process.env.llm_context_window) || undefined,
    ai_keep_recent_tokens: Number(process.env.llm_keep_recent_tokens) || undefined,
    galaxy_root: incoming.root,
    dataset_id: incoming.datasetId,
    // Filled in from the session document once it is loaded.
    session_id: undefined as string | undefined,
    record_page_id: undefined as string | undefined,
    session_started_at: undefined as string | undefined,
  };
}
