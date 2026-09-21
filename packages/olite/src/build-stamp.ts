/** Which build is being served, so a stale deployed copy is visible without reading files. */

export interface BuildStamp {
    commit: string;
    built: string;
}

/** The date alone; the tooltip carries the time and the commit. */
function shortDate(iso: string): string {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

export function describeBuild(stamp: BuildStamp): { label: string; title: string } | null {
    const date = shortDate(stamp.built);
    if (!stamp.commit && !date) {
        return null;
    }
    const label = [stamp.commit, date].filter(Boolean).join(" · ");
    const title = [
        stamp.commit ? `Commit ${stamp.commit}` : "Commit unknown",
        stamp.built ? `Built ${stamp.built}` : "Build time unknown",
    ].join("\n");
    return { label, title };
}

export function mountBuildStamp(container: HTMLElement, stamp: BuildStamp): void {
    const el = container.querySelector<HTMLElement>("#build-stamp");
    if (!el) {
        return;
    }
    const described = describeBuild(stamp);
    if (!described) {
        return;
    }
    el.textContent = described.label;
    el.title = described.title;
    el.classList.remove("hidden");
}
