/** What is actually running: which build, which brain, which Galaxy, which model. */

export interface RuntimeIdentity {
    commit: string;
    built: string;
    /** The brain wheel's filename; its build tag is the hash of the wheel's contents. */
    wheel: string;
    galaxy: string;
    provider: string;
    model: string;
}

/** The date alone; the tooltip carries the time. */
function shortDate(iso: string): string {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

/** The content hash the build stamped into the wheel name, when there is one. */
export function brainTag(wheel: string): string {
    return /-0([0-9a-f]{12})-py3-none-any\.whl$/.exec(wheel || "")?.[1] || "";
}

export function describeIdentity(id: RuntimeIdentity): { label: string; title: string } | null {
    const date = shortDate(id.built);
    if (!id.commit && !date) {
        return null;
    }
    const brain = brainTag(id.wheel);
    const title = [
        id.commit ? `Shell ${id.commit}` : "Shell unknown",
        brain ? `Brain ${brain}` : "Brain unknown",
        id.built ? `Built ${id.built}` : "Build time unknown",
        id.galaxy ? `Galaxy ${id.galaxy}` : "",
        [id.provider, id.model].filter(Boolean).join(" / "),
    ]
        .filter(Boolean)
        .join("\n");
    return { label: [id.commit, date].filter(Boolean).join(" · "), title };
}

export function mountBuildStamp(container: HTMLElement, id: RuntimeIdentity): void {
    const el = container.querySelector<HTMLElement>("#build-stamp");
    if (!el) {
        return;
    }
    const described = describeIdentity(id);
    if (!described) {
        return;
    }
    el.textContent = described.label;
    el.title = described.title;
    el.classList.remove("hidden");
}
