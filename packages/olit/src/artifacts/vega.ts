import embed from "vega-embed";

/** Render a Vega or Vega-Lite spec into a container element. */
export async function renderVega(container: HTMLElement, spec: unknown): Promise<void> {
    try {
        await embed(container, { ...(spec as object), width: "container", height: "container" } as any, {
            renderer: "svg",
            actions: false,
        });
    } catch (e) {
        container.textContent = `Could not render chart: ${e}`;
    }
}
