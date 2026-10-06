import { loader as vegaLoader } from "vega";
import embed from "vega-embed";

/** The one thing a chart may load: a dataset's display route, under Galaxy's root on this origin. */
export function loadable(uri: string, root = "/"): boolean {
  try {
    const url = new URL(uri, document.baseURI);
    return (
      url.origin === new URL(document.baseURI).origin &&
      url.pathname.startsWith(root) &&
      /^api\/datasets\/[^/]+\/display$/.test(url.pathname.slice(root.length))
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
function confinedLoader(root: string) {
  // Over http, against the page's base, whichever build of vega is running. Galaxy mounts the page
  // in a frame whose location is about:blank; its base is still Galaxy's.
  const base = vegaLoader({ mode: "http", baseURL: new URL(document.baseURI).origin });
  return {
    ...base,
    async sanitize(uri: string, options: Parameters<typeof base.sanitize>[1]) {
      if (!loadable(uri, root)) {
        throw new Error(`a chart may only load a dataset's display, not ${uri}`);
      }
      return base.sanitize(uri, options);
    },
  };
}

/** Render a Vega or Vega-Lite spec into a container element. */
export async function renderVega(container: HTMLElement, spec: unknown, root = "/"): Promise<void> {
  const { usermeta: _, ...confined } = spec as Record<string, unknown>;
  try {
    await embed(container, { ...confined, width: "container", height: "container" } as any, {
      renderer: "svg",
      actions: false,
      loader: confinedLoader(root) as any,
      // Expressions are interpreted rather than compiled into functions.
      ast: true,
    });
  } catch (e) {
    container.textContent = `Could not render chart: ${e}`;
  }
}
