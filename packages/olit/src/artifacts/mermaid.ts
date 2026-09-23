/** Render a Mermaid diagram; the SVG is sanitized because labels carry Galaxy text. */

import DOMPurify from "dompurify";

type Mermaid = typeof import("mermaid").default;

let loading: Promise<Mermaid> | null = null;
let seq = 0;

/** Load mermaid on first use; ~2.5 MB, kept out of the entry chunk. */
function load(): Promise<Mermaid> {
    if (!loading) {
        loading = import("mermaid").then(({ default: mermaid }) => {
            // Render on demand only, and no click handlers or inline HTML.
            mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
            return mermaid;
        });
    }
    return loading;
}

export async function renderMermaid(container: HTMLElement, diagram: unknown): Promise<void> {
    const source = typeof diagram === "string" ? diagram.trim() : "";
    if (!source) {
        container.textContent = "No diagram to render.";
        return;
    }
    try {
        const mermaid = await load();
        // mermaid requires a DOM-unique id per render; it derives its internal ids from it.
        const { svg } = await mermaid.render(`mermaid-artifact-${seq++}`, source);
        container.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        const el = container.querySelector("svg");
        if (el) {
            // Fill the artifact card rather than mermaid's intrinsic size.
            el.removeAttribute("height");
            el.setAttribute("width", "100%");
            el.style.maxHeight = "100%";
        }
    } catch (e) {
        container.textContent = `Could not render diagram: ${e}`;
    }
}
