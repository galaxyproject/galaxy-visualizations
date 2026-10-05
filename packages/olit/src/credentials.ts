/** Provider/model/key selection, held on the client and never sent to Galaxy. */

import { needsKey, providerById, takesModel } from "./agent/providers";

export interface Credentials {
  provider: string;
  model?: string;
  apiKey?: string;
  /** Overrides the provider's own endpoint; the only way to reach a self-hosted server. */
  baseUrl?: string;
}

// sessionStorage, so the key survives a reload but dies with the tab. It is
// never written to the plugin specs, which Galaxy persists server-side.
const STORE_KEY = "olit.credentials";

export function loadCredentials(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(creds));
  } catch {
    // A blocked store is not fatal: the key still works for this page.
  }
}

export function clearCredentials(): void {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Is this selection usable? A provider whose endpoint takes no user key (the
 * Galaxy proxy, a local server) is usable without one; every other provider
 * needs a non-empty key. Returning a reason rather than a bool lets the caller
 * keep the overlay up and say what is missing, instead of starting an agent that
 * fails on its first request.
 */
export function credentialProblem(creds: Credentials | null): string | null {
  if (!creds) return "Choose a provider to continue.";
  const p = providerById(creds.provider);
  if (!p) return `Unknown provider "${creds.provider}".`;
  if (needsKey(p) && !creds.apiKey?.trim()) return `${p.name} requires an API key.`;
  // A server that takes no key ignores the model name too, so only hosted providers need one.
  if (takesModel(p) && needsKey(p) && !creds.model?.trim()) {
    return `Name a model for ${p.name}.`;
  }
  if (creds.baseUrl?.trim() && !/^https?:\/\//i.test(creds.baseUrl.trim())) {
    return "The endpoint must start with http:// or https://.";
  }
  return null;
}
