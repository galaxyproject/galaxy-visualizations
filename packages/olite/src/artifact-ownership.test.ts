import { describe, expect, it } from "vitest";

import type { Artifact } from "./artifacts";

/**
 * The shell owns what turns produce. The brain is rebuilt whenever the session config
 * changes -- a model or history switch -- so artifacts it held would vanish exactly when a
 * user switches models mid-conversation and then asks for the chart to go in the record.
 */
const LIMIT = 20;

function accumulate(existing: Artifact[], incoming: Artifact[]): Artifact[] {
    const produced = [...existing, ...incoming];
    produced.splice(0, produced.length - LIMIT);
    return produced;
}

const chart = (n: number) => ({ kind: "vega-lite", title: `chart ${n}`, spec: {} }) as unknown as Artifact;

describe("who owns an artifact between turns", () => {
    it("keeps what earlier turns produced, so a later turn can place it", () => {
        const produced = accumulate(accumulate([], [chart(1)]), [chart(2)]);
        expect(produced.map((a) => a.title)).toEqual(["chart 1", "chart 2"]);
    });

    it("keeps only the most recent, because a vega spec carries its rows", () => {
        let produced: Artifact[] = [];
        for (let i = 0; i < LIMIT + 5; i++) produced = accumulate(produced, [chart(i)]);
        expect(produced).toHaveLength(LIMIT);
        expect(produced[0]!.title).toBe(`chart 5`);
        expect(produced.at(-1)!.title).toBe(`chart ${LIMIT + 4}`);
    });

    it("carries nothing over when the conversation is reset", () => {
        const produced = accumulate([], [chart(1)]);
        produced.length = 0;
        expect(produced).toEqual([]);
    });
});
