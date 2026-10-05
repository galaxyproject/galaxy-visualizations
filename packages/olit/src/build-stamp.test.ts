import { describe, expect, it } from "vitest";

import { describeIdentity, mountBuildStamp } from "./build-stamp";

function identity(over: Partial<Parameters<typeof describeIdentity>[0]> = {}) {
  return {
    commit: "7d89d0ee",
    built: "2026-09-21T18:30:00.000Z",
    galaxy: "http://localhost:8080/",
    provider: "galaxy",
    model: "claude-sonnet-5",
    ...over,
  };
}

function footer(): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = '<span id="build-stamp" class="footer-control hidden"></span>';
  return el;
}

describe("describeIdentity", () => {
  it("labels with the shell commit and date", () => {
    expect(describeIdentity(identity())!.label).toBe("7d89d0ee · 2026-09-21");
  });

  it("names shell, Galaxy and model in the tooltip", () => {
    const title = describeIdentity(identity())!.title;
    expect(title).toContain("Shell 7d89d0ee");
    expect(title).toContain("Galaxy http://localhost:8080/");
    expect(title).toContain("galaxy / claude-sonnet-5");
  });

  it("says a part is unknown rather than dropping it silently", () => {
    const title = describeIdentity(identity({ built: "", commit: "7d89d0ee" }))!.title;
    expect(title).toContain("Build time unknown");
  });

  it("says nothing when the build identified itself with neither commit nor time", () => {
    expect(describeIdentity(identity({ commit: "", built: "" }))).toBeNull();
    expect(describeIdentity(identity({ commit: "", built: "not a date" }))).toBeNull();
  });
});

describe("mountBuildStamp", () => {
  it("shows the stamp once there is something to show", () => {
    const container = footer();
    mountBuildStamp(container, identity());
    const el = container.querySelector("#build-stamp")!;
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("7d89d0ee · 2026-09-21");
  });

  it("stays hidden rather than showing an empty control", () => {
    const container = footer();
    mountBuildStamp(container, identity({ commit: "", built: "" }));
    expect(container.querySelector("#build-stamp")!.classList.contains("hidden")).toBe(true);
  });
});
