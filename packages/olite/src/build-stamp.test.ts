import { describe, expect, it } from "vitest";

import { describeBuild, mountBuildStamp } from "./build-stamp";

function footer(): HTMLElement {
    const el = document.createElement("div");
    el.innerHTML = '<span id="build-stamp" class="footer-control hidden"></span>';
    return el;
}

describe("describeBuild", () => {
    it("pairs the commit with the build date", () => {
        const described = describeBuild({ commit: "7d89d0ee", built: "2026-09-21T18:30:00.000Z" })!;
        expect(described.label).toBe("7d89d0ee · 2026-09-21");
        expect(described.title).toContain("7d89d0ee");
        expect(described.title).toContain("2026-09-21T18:30:00.000Z");
    });

    it("still identifies the build when one half is missing", () => {
        expect(describeBuild({ commit: "abc1234", built: "" })!.label).toBe("abc1234");
        expect(describeBuild({ commit: "", built: "2026-09-21T18:30:00.000Z" })!.label).toBe("2026-09-21");
    });

    it("says nothing when the build identified itself with neither", () => {
        expect(describeBuild({ commit: "", built: "" })).toBeNull();
        expect(describeBuild({ commit: "", built: "not a date" })).toBeNull();
    });
});

describe("mountBuildStamp", () => {
    it("shows the stamp once there is something to show", () => {
        const container = footer();
        mountBuildStamp(container, { commit: "7d89d0ee", built: "2026-09-21T18:30:00.000Z" });
        const el = container.querySelector("#build-stamp")!;
        expect(el.classList.contains("hidden")).toBe(false);
        expect(el.textContent).toBe("7d89d0ee · 2026-09-21");
    });

    it("stays hidden rather than showing an empty control", () => {
        const container = footer();
        mountBuildStamp(container, { commit: "", built: "" });
        expect(container.querySelector("#build-stamp")!.classList.contains("hidden")).toBe(true);
    });
});
