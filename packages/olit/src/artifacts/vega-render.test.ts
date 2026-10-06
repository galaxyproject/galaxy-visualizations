import { afterEach, describe, expect, it, vi } from "vitest";

import { renderVega } from "./vega";

const chart = (data: object) => ({
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  data,
  transform: [{ calculate: "datum.a * 2", as: "b" }],
  mark: "bar",
  encoding: { x: { field: "a", type: "quantitative" }, y: { field: "b", type: "quantitative" } },
});

/** What vega reported while rendering: it logs a load it could not make and carries on. */
async function render(spec: object) {
  const warned: string[] = [];
  vi.spyOn(console, "warn").mockImplementation((...parts) => {
    warned.push(parts.map(String).join(" "));
  });
  const container = document.createElement("div");
  await renderVega(container, spec);
  return { container, warned: warned.join("\n") };
}

describe("renderVega", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps a spec's usermeta from replacing the embed options", async () => {
    const spec = {
      ...chart({ values: [{ a: 1 }] }),
      usermeta: { embedOptions: { actions: true } },
    };
    const { container } = await render(spec);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector(".vega-actions")).toBeNull();
  });

  it("draws a chart with its expressions interpreted", async () => {
    const { container, warned } = await render(chart({ values: [{ a: 1 }, { a: 2 }] }));
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("Could not render");
    expect(warned).not.toMatch(/may only load/);
  });

  it("lets a dataset's display through to the network", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(String(url));
      return new Response("[]", { headers: { "content-type": "application/json" } });
    });
    const { warned } = await render(chart({ url: "/api/datasets/f2c1/display" }));
    vi.unstubAllGlobals();
    expect(warned).not.toMatch(/may only load/);
    expect(fetched).toEqual([`${window.location.origin}/api/datasets/f2c1/display`]);
  });

  it("refuses a spec that reads another Galaxy API with the user's session", async () => {
    const { warned } = await render(chart({ url: "/api/users/current" }));
    expect(warned).toMatch(/may only load a dataset's display, not \/api\/users\/current/);
  });

  it("refuses an image that would carry values to another host", async () => {
    const { container } = await render({
      data: { values: [{ a: 1 }] },
      mark: "image",
      encoding: { url: { value: "https://elsewhere.test/leak.png" } },
    });
    // vega drops a refused image quietly; what matters is that nothing points at the host.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.innerHTML).not.toContain("elsewhere.test");
  });
});
