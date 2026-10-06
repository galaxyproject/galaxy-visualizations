import { afterEach, describe, expect, it, vi } from "vitest";

import { loadable } from "./vega";
import { incoming, renderVisualization } from "./visualization";

const here = window.location.origin;

describe("what a restored or model-made artifact may reach", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    plugin = PLUGIN;
  });

  const igv = {
    kind: "visualization",
    title: "t",
    visualization: "igv",
    dataset_id: "f2",
  } as const;

  const PLUGIN = {
    name: "igv",
    href: "/static/plugins/visualizations/igv/static",
    entry_point: { attr: { src: "dist/main.js", css: "dist/main.css" } },
  };

  let asked: string[] = [];
  let plugin: unknown = PLUGIN;
  const galaxy = {
    root: "/",
    get: async (path: string): Promise<any> => {
      asked.push(path);
      if (!plugin) throw new Error("HTTP 500: server error");
      return plugin;
    },
  };

  async function mounted(artifact: Parameters<typeof renderVisualization>[1], root = "/") {
    // The mounted plugin is never run here, only where it is pointed.
    (window as any).happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    asked = [];
    const body = document.createElement("div");
    document.body.appendChild(body);
    await renderVisualization(body, artifact, { ...galaxy, root });
    return body.querySelector("iframe")!.contentDocument!;
  }

  it("hands the plugin its whole config, as Galaxy's VisualizationFrame does", () => {
    const tracks = [{ x: "0", y: "1" }];
    const shown = incoming({ ...igv, settings: { locus: "chr1" }, tracks }, PLUGIN, `${here}/`);
    expect(shown).toEqual({
      root: `${here}/`,
      visualization_config: { dataset_id: "f2", settings: { locus: "chr1" }, tracks },
      visualization_id: undefined,
      visualization_plugin: PLUGIN,
      visualization_title: "t",
    });
    expect(incoming({ ...igv, visualization_id: "v1" }, PLUGIN, "/").visualization_id).toBe("v1");
  });

  it("mounts the plugin's own entry point and stylesheet under its href on Galaxy", async () => {
    const doc = await mounted({ ...igv, tracks: [{ x: "0" }] }, "/galaxy/");
    expect(asked).toEqual(["api/plugins/igv"]);
    const handed = JSON.parse(doc.getElementById("app")!.getAttribute("data-incoming")!);
    expect(handed.root).toBe(`${here}/galaxy/`);
    expect(handed.visualization_config.tracks).toEqual([{ x: "0" }]);
    const script = doc.querySelector("script")!;
    expect(script.getAttribute("src")).toBe(`${here}${PLUGIN.href}/dist/main.js`);
    expect(script.type).toBe("module");
    expect(doc.querySelector("link")!.getAttribute("href")).toBe(
      `${here}${PLUGIN.href}/dist/main.css`,
    );
  });

  it("keeps whatever a config names inside one plugin path segment", async () => {
    await mounted({ ...igv, visualization: "../users/current" });
    expect(asked).toEqual(["api/plugins/..%2Fusers%2Fcurrent"]);
  });

  it("says so when the plugin declares no module to mount", async () => {
    plugin = { name: "igv" };
    const doc = await mounted(igv);
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.body.textContent).toContain("Unable to locate plugin module for: igv");
  });

  it("reports a plugin Galaxy did not answer for as unavailable, with the reason", async () => {
    plugin = null;
    const body = document.body.appendChild(document.createElement("div"));
    await renderVisualization(body, igv, galaxy);
    expect(body.querySelector("iframe")).toBeNull();
    expect(body.textContent).toBe(
      "Visualization 'igv' not available: Error: HTTP 500: server error.",
    );
  });

  it("holds both to Galaxy's own root path, not to any path that ends the same way", () => {
    expect(loadable("/galaxy/api/datasets/f2c1/display", "/galaxy/")).toBe(true);
    expect(loadable("/galaxy/api/datasets/f2c1/display")).toBe(false);
    expect(loadable("/other/api/datasets/f2c1/display", "/galaxy/")).toBe(false);
  });

  it("lets a chart load only a dataset's display on this origin", () => {
    expect(loadable("/api/datasets/f2c1/display")).toBe(true);
    expect(loadable(`${here}/api/datasets/f2c1/display`)).toBe(true);
    expect(loadable("/api/users/current")).toBe(false);
    expect(loadable("/api/datasets/f2c1/../../users/current/display")).toBe(false);
    expect(loadable("https://elsewhere.test/api/datasets/f2c1/display")).toBe(false);
    expect(loadable("data:text/csv,a,b")).toBe(false);
  });

  describe("in Galaxy's frame, whose location is about:blank", () => {
    it("still mounts a visualization and loads a dataset's display", async () => {
      vi.spyOn(window, "location", "get").mockReturnValue({
        ...window.location,
        href: "about:blank",
        origin: "null",
      });
      expect(loadable("/api/datasets/f2c1/display")).toBe(true);

      const doc = await mounted(igv);
      expect(JSON.parse(doc.getElementById("app")!.getAttribute("data-incoming")!).root).toBe(
        `${here}/`,
      );
    });
  });
});
