import { loader as vegaLoader } from "vega";
import embed from "vega-embed";

/** The one thing a chart may load: a dataset's display route, on this origin. */
export function loadable(uri: string): boolean {
  try {
    const url = new URL(uri, window.location.href);
    return (
      url.origin === window.location.origin &&
      /^\/api\/datasets\/[^/]+\/display$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * A spec comes from the model or from a restored session, and neither is trusted: data, images
 * and links are confined to dataset displays, so a chart cannot read another Galaxy API with the
 * user's session or carry values to another host.
 */
function confinedLoader() {
  // Over http, against this page's origin, whichever build of vega is running.
  const base = vegaLoader({ mode: "http", baseURL: window.location.origin });
  return {
    ...base,
    async sanitize(uri: string, options: Parameters<typeof base.sanitize>[1]) {
      if (!loadable(uri)) {
        throw new Error(`a chart may only load a dataset's display, not ${uri}`);
      }
      return base.sanitize(uri, options);
    },
  };
}

/** Render a Vega or Vega-Lite spec into a container element. */
export async function renderVega(container: HTMLElement, spec: unknown): Promise<void> {
  try {
    await embed(
      container,
      { ...(spec as object), width: "container", height: "container" } as any,
      {
        renderer: "svg",
        actions: false,
        loader: confinedLoader() as any,
        // Expressions are interpreted rather than compiled into functions.
        ast: true,
      },
    );
  } catch (e) {
    container.textContent = `Could not render chart: ${e}`;
  }
}
