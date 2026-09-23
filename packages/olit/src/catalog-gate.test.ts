import { describe, expect, it } from "vitest";
import { catalogRefusalMessage, galaxyCanRun } from "./catalog-gate";

describe("galaxyCanRun", () => {
    it("allows execution when the catalog loaded with operations", () => {
        expect(galaxyCanRun({ loaded: true, op_count: 44 })).toBe(true);
    });

    it("refuses when the catalog failed to load", () => {
        expect(galaxyCanRun({ loaded: false, op_count: 0, error: "404" })).toBe(false);
    });

    it("refuses a catalog that loaded but exposes nothing", () => {
        expect(galaxyCanRun({ loaded: true, op_count: 0 })).toBe(false);
    });

    it("does not block before the brain has reported", () => {
        // Absence of evidence is not evidence of a broken catalog; the first turn has
        // no diagnostics yet and must not be refused.
        expect(galaxyCanRun(undefined)).toBe(true);
        expect(galaxyCanRun(null)).toBe(true);
    });

    it("carries the catalog's own error into the refusal", () => {
        expect(catalogRefusalMessage({ loaded: false, error: "connection refused" })).toContain(
            "connection refused",
        );
    });
});
