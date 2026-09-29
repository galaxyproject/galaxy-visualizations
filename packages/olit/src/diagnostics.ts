/** What the brain's turn diagnostics say, and what the shell decides from them.
 *
 * loom refuses `/execute` when the newest plan is `[remote]` and `isGalaxyConnected()` is false
 * (init-gate, loom #104). olit has no slash commands; the plan card's Approve button is its only
 * structural "proceed toward execution" control.
 */

/** Galaxy readiness, spelled as `prompt._galaxy_status()` reports it. */
export const GALAXY_READY = "ok";
export const GALAXY_UNREACHABLE = "unreachable";
export const OPS_UNAVAILABLE = "ops-unavailable";

export type GalaxyStatus = typeof GALAXY_READY | typeof GALAXY_UNREACHABLE | typeof OPS_UNAVAILABLE;

export interface CatalogStatus {
  loaded?: boolean;
  op_count?: number;
  error?: string | null;
  /** Whether anything has needed the catalog yet; it loads on first use. */
  asked?: boolean;
}

export interface Diagnostics {
  galaxy?: GalaxyStatus;
  catalog?: CatalogStatus;
  capabilities?: string[];
}

/** Whether the catalog was asked for and could not answer. */
export function catalogFailed(catalog: CatalogStatus | null | undefined): boolean {
  if (!catalog || catalog.asked === false) return false;
  return !catalog.loaded || (catalog.op_count ?? 0) === 0;
}

/**
 * Whether a plan can start.
 *
 * Only an unreachable Galaxy stops every step: both galaxy-ops and the direct client reach the
 * same server. With galaxy-ops unloaded 16 of the 51 Galaxy tools still run, and the catalog
 * gates the three Olit processes rather than any Galaxy tool, so neither refuses a plan.
 * Unreported means the brain has not answered yet.
 */
export function galaxyCanRun(galaxy: GalaxyStatus | null | undefined): boolean {
  return galaxy !== GALAXY_UNREACHABLE;
}

export function galaxyRefusalMessage(): string {
  return (
    "Galaxy did not answer, so nothing in this plan can run. Check that the server is up and " +
    "reload the page — the plan is kept."
  );
}

/** What a plan can still do with galaxy-ops unloaded, or null when it is loaded. */
export function galaxyPartialWarning(galaxy: GalaxyStatus | null | undefined): string | null {
  if (galaxy !== OPS_UNAVAILABLE) {
    return null;
  }
  return (
    "Most Galaxy tools did not load in this session, so some steps will fail. Running a tool, " +
    "uploading, reading a history and the visualizations still work. Reload the page to get the rest back."
  );
}

/** The catalog's own error, for the three Olit processes that need it. */
export function catalogRefusalMessage(catalog: CatalogStatus | null | undefined): string {
  const reason = catalog && catalog.error ? `: ${catalog.error}` : ".";
  return (
    `The Galaxy tool catalog did not load${reason} lineage_report, organize_datasets and ` +
    `charting need it; every other Galaxy tool is unaffected. Reload the page to retry.`
  );
}
