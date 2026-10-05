import { afterEach, describe, expect, it, vi } from "vitest";

import { loadable } from "./vega";
import { displayable, renderVisualization } from "./visualization";

const here = window.location.origin;

describe("what a restored or model-made artifact may reach", () => {
  it("frames only Galaxy's visualization display on this origin", () => {
    expect(displayable("/visualizations/display?visualization=igv&dataset_id=f2")).toBe(true);
    expect(displayable("javascript:alert(document.cookie)")).toBe(false);
    expect(displayable("https://elsewhere.test/visualizations/display")).toBe(false);
    expect(displayable("/api/histories")).toBe(false);
    expect(displayable(undefined)).toBe(false);
  });

  it("holds both to Galaxy's own root path, not to any path that ends the same way", () => {
    expect(loadable("/galaxy/api/datasets/f2c1/display", "/galaxy/")).toBe(true);
    expect(loadable("/galaxy/api/datasets/f2c1/display")).toBe(false);
    expect(loadable("/other/api/datasets/f2c1/display", "/galaxy/")).toBe(false);
    expect(displayable("/galaxy/visualizations/display?visualization=igv", "/galaxy/")).toBe(true);
    expect(displayable("/other/visualizations/display", "/galaxy/")).toBe(false);
    expect(displayable("/other/visualizations/display")).toBe(false);
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

    it("still frames a saved visualization by its relative address", () => {
      vi.spyOn(window, "location", "get").mockReturnValue({
        ...window.location,
        href: "about:blank",
        origin: here,
      });
      const url = "/visualizations/display?visualization=igv&dataset_id=f2";
      expect(displayable(url)).toBe(true);
      expect(loadable("/api/datasets/f2c1/display")).toBe(true);

      const body = document.createElement("div");
      renderVisualization(body, url);
      expect(body.querySelector("iframe")?.src).toBe(new URL(url, here).href);
    });
  });
});
