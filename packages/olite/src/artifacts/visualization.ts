/** Render a Galaxy visualization in place, on the Galaxy origin that serves olite. */
export function renderVisualization(body: HTMLElement, url: unknown): void {
    if (typeof url !== "string" || !url) {
        body.textContent = "The visualization has no address to display.";
        return;
    }

    const frame = document.createElement("iframe");
    frame.src = url;
    frame.title = "Galaxy visualization";
    frame.style.cssText = "width:100%;height:100%;min-height:320px;border:0;";
    frame.setAttribute("loading", "lazy");
    body.appendChild(frame);
}
