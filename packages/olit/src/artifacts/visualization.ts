/** The only address a visualization artifact may name: Galaxy's display route, on this origin. */
export function displayable(url: unknown, root = "/"): url is string {
  if (typeof url !== "string" || !url) {
    return false;
  }
  try {
    // A restored session is a document anyone could have written, so `javascript:` or another
    // host must not reach the iframe.
    const resolved = new URL(url, document.baseURI);
    return (
      resolved.origin === window.location.origin &&
      resolved.pathname === `${root}visualizations/display`
    );
  } catch {
    return false;
  }
}

/** Render a Galaxy visualization in place, on the Galaxy origin that serves olit. */
export function renderVisualization(body: HTMLElement, url: unknown, root = "/"): void {
  if (!displayable(url, root)) {
    body.textContent = "The visualization has no address to display.";
    return;
  }

  const frame = document.createElement("iframe");
  frame.src = new URL(url, document.baseURI).href;
  frame.title = "Galaxy visualization";
  frame.style.cssText = "width:100%;height:100%;min-height:320px;border:0;";
  frame.setAttribute("loading", "lazy");
  body.appendChild(frame);
}
