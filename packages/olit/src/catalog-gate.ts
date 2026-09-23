/** Whether Galaxy work can be started at all, from the brain's catalog diagnostics.
 *
 * loom refuses `/execute` when the newest plan is `[galaxy]` and `isGalaxyConnected()` is
 * false, short-circuiting before any LLM call (init-gate, loom #104). olit has no slash
 * commands; the plan card's Approve button is its only structural "proceed toward
 * execution" control, and the equivalent unavailable state is a tool catalog that did not
 * load. Same refusal, expressed in the controls this build actually has.
 */
export interface CatalogStatus {
    loaded?: boolean;
    op_count?: number;
    error?: string | null;
}

export function galaxyCanRun(catalog: CatalogStatus | null | undefined): boolean {
    // Unknown means the brain has not reported yet: do not block on missing evidence.
    if (!catalog) return true;
    return Boolean(catalog.loaded) && (catalog.op_count ?? 0) > 0;
}

export function catalogRefusalMessage(catalog: CatalogStatus | null | undefined): string {
    const reason = catalog && catalog.error ? `: ${catalog.error}` : ".";
    return (
        `Galaxy is not available${reason} The tool catalog did not load, so nothing in this ` +
        `plan can run. Reload the page once Galaxy is reachable — the plan is kept.`
    );
}
