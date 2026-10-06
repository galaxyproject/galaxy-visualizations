import { afterEach, describe, expect, it, vi } from "vitest";

import { loadable } from "./vega";
import { displayAddress, renderVisualization } from "./visualization";

const here = window.location.origin;

describe("what a restored or model-made artifact may reach", () => {
  const igv = {
    kind: "visualization",
    title: "t",
    visualization: "igv",
    dataset_id: "f2",
  } as const;

  it("frames a visualization at Galaxy's display route, built from its config", () => {
    const shown = new URL(displayAddress(igv), here);
    expect(shown.pathname).toBe("/visualizations/display");
    expect(shown.searchParams.get("dataset_id")).toBe("f2");
    const saved = new URL(displayAddress({ ...igv, visualization_id: "v1" }), here);
    expect(saved.searchParams.get("visualization_id")).toBe("v1");
    expect(saved.searchParams.has("dataset_id")).toBe(false);
  });

  it("keeps whatever a config holds inside the display route's query", () => {
    const hostile = { ...igv, visualization: "x&visualization=y", dataset_id: "../../api/users" };
    const url = new URL(displayAddress(hostile, "/galaxy/"), here);
    expect(url.origin).toBe(here);
    expect(url.pathname).toBe("/galaxy/visualizations/display");
    expect(url.searchParams.getAll("visualization")).toEqual(["x&visualization=y"]);
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
    afterEach(() => vi.restoreAllMocks());

    it("still frames a visualization and loads a dataset's display", () => {
      vi.spyOn(window, "location", "get").mockReturnValue({
        ...window.location,
        href: "about:blank",
        origin: "null",
      });
      expect(loadable("/api/datasets/f2c1/display")).toBe(true);

      const body = document.createElement("div");
      renderVisualization(body, igv);
      expect(body.querySelector("iframe")?.src).toBe(new URL(displayAddress(igv), here).href);
    });
  });
});
