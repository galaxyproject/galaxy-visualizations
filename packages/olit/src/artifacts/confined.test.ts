import { describe, expect, it } from "vitest";

import { loadable } from "./vega";
import { displayable } from "./visualization";

const here = window.location.origin;

describe("what a restored or model-made artifact may reach", () => {
  it("frames only Galaxy's visualization display on this origin", () => {
    expect(displayable("/visualizations/display?visualization=igv&dataset_id=f2")).toBe(true);
    expect(displayable("javascript:alert(document.cookie)")).toBe(false);
    expect(displayable("https://elsewhere.test/visualizations/display")).toBe(false);
    expect(displayable("/api/histories")).toBe(false);
    expect(displayable(undefined)).toBe(false);
  });

  it("lets a chart load only a dataset's display on this origin", () => {
    expect(loadable("/api/datasets/f2c1/display")).toBe(true);
    expect(loadable(`${here}/api/datasets/f2c1/display`)).toBe(true);
    expect(loadable("/api/users/current")).toBe(false);
    expect(loadable("/api/datasets/f2c1/../../users/current/display")).toBe(false);
    expect(loadable("https://elsewhere.test/api/datasets/f2c1/display")).toBe(false);
    expect(loadable("data:text/csv,a,b")).toBe(false);
  });
});
