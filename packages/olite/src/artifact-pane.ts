/** The artifact pane: whether it is showing, the shortcut that toggles it, and the divider. */

const COLLAPSED_KEY = "olite.artifactCollapsed";
const BREAKPOINT = 700;
const MIN_CHAT_PERCENT = 25;
const MAX_CHAT_PERCENT = 75;

/** Collapsed unless the user has said otherwise; a blocked store only costs the preference. */
function readPreference(): boolean {
    try {
        return localStorage.getItem(COLLAPSED_KEY) !== "0";
    } catch {
        return true;
    }
}

function writePreference(collapsed: boolean): void {
    try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
        // Nothing to do: the pane still works, it just will not be remembered.
    }
}

export interface ArtifactPane {
    /** Show the pane because something was produced for it. */
    reveal(): void;
    toggle(): void;
}

export function mountArtifactPane(container: HTMLElement): ArtifactPane {
    const chatPane = container.querySelector<HTMLElement>("#chat-pane")!;
    const divider = container.querySelector<HTMLElement>("#divider")!;
    const appMain = container.querySelector<HTMLElement>("#app-main")!;
    const button = container.querySelector<HTMLButtonElement>("#artifact-btn")!;

    // What the user last chose, which a narrow window overrides without overwriting.
    let preferred = readPreference();

    const show = (collapsed: boolean) => {
        document.body.classList.toggle("artifact-collapsed", collapsed);
        if (collapsed) {
            chatPane.style.flex = "";
        }
    };
    const set = (collapsed: boolean) => {
        preferred = collapsed;
        writePreference(collapsed);
        show(collapsed);
    };
    const collapsed = () => document.body.classList.contains("artifact-collapsed");

    let narrow = window.innerWidth < BREAKPOINT;
    show(narrow || preferred);

    window.addEventListener("resize", () => {
        const isNarrow = window.innerWidth < BREAKPOINT;
        if (isNarrow === narrow) {
            return;
        }
        narrow = isNarrow;
        show(isNarrow ? true : preferred);
    });

    button.addEventListener("click", () => set(!collapsed()));
    container.addEventListener("keydown", (e) => {
        const ev = e as KeyboardEvent;
        if ((ev.ctrlKey || ev.metaKey) && ev.key === "\\") {
            ev.preventDefault();
            set(!collapsed());
        }
    });

    // Clamped so neither pane can be dragged away entirely.
    let dragging = false;
    divider.addEventListener("mousedown", (e) => {
        e.preventDefault();
        dragging = true;
        divider.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", (e) => {
        if (!dragging) {
            return;
        }
        const width = appMain.getBoundingClientRect().width;
        const left = chatPane.getBoundingClientRect().left;
        const pct = (((e as MouseEvent).clientX - left) / width) * 100;
        chatPane.style.flex = `0 0 ${Math.max(MIN_CHAT_PERCENT, Math.min(MAX_CHAT_PERCENT, pct))}%`;
    });
    document.addEventListener("mouseup", () => {
        if (!dragging) {
            return;
        }
        dragging = false;
        divider.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    });

    return {
        reveal: () => set(false),
        toggle: () => set(!collapsed()),
    };
}
