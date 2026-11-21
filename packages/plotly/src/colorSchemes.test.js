import { describe, expect, it } from "vitest";
import COLOR_SCHEMES from "@/colors.json";
import { schemeColors } from "@/colorSchemes";

describe("schemeColors", () => {
    it("returns the scheme's colors in order", () => {
        expect(schemeColors("classic", 3)).toEqual(COLOR_SCHEMES.classic.slice(0, 3));
    });

    it("repeats the scheme darkened for counts beyond its length", () => {
        const colors = schemeColors("classic", 12);
        expect(colors).toHaveLength(12);
        expect(COLOR_SCHEMES.classic[0]).toBe("rgb(31,119,180)");
        expect(colors[10]).toBe("rgb(26,101,153)");
    });

    it("returns nothing for an unknown scheme", () => {
        expect(schemeColors("plotly", 3)).toBeUndefined();
    });
});
