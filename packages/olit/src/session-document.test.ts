import { describe, expect, it } from "vitest";
import {
    advance,
    isSessionDocument,
    newDocument,
    noteModel,
    restoreMessages,
    storableMessages,
} from "./session-document";
import type { Message } from "./pyodide-runner";

const SEED: Message = { role: "system", content: "You are Olit. Version one." };
const turn = (d: ReturnType<typeof newDocument>, text: string) =>
    advance(d, { messages: [SEED, { role: "user", content: text }], artifacts: [] });

describe("what the document stores", () => {
    it("drops the seed prompt, so a resumed session runs on today's prompt", () => {
        const stored = storableMessages([SEED, { role: "user", content: "hi" }]);
        expect(stored).toEqual([{ role: "user", content: "hi" }]);
    });

    it("re-seeds a restored conversation with the prompt the plugin ships now", () => {
        const doc = turn(newDocument({ historyId: "h1" }), "hi");
        const newer: Message = { role: "system", content: "You are Olit. Version two." };

        expect(restoreMessages(doc, newer)[0]).toEqual(newer);
    });

    it("drops the record block the brain refreshes every turn", () => {
        const stored = storableMessages([
            SEED,
            { role: "user", content: "hi" },
            { role: "system", content: "<!-- olit:record -->\nstale dataset names" },
        ]);
        expect(stored.some((m) => (m.content || "").includes("olit:record"))).toBe(false);
    });

    it("keeps a stable session id across turns", () => {
        const first = newDocument({ historyId: "h1" });
        const later = turn(turn(first, "a"), "b");
        expect(later.session.id).toBe(first.session.id);
        expect(later.session.turn).toBe(2);
    });
});

describe("model provenance", () => {
    it("records which model produced the conversation", () => {
        const doc = turn(newDocument({}), "a");
        noteModel(doc, { provider: "openrouter", model: "x" });
        expect(doc.session.models).toEqual([
            { provider: "openrouter", model: "x", firstTurn: 1, lastTurn: 1 },
        ]);
    });

    it("extends the current entry rather than repeating it", () => {
        const doc = turn(newDocument({}), "a");
        noteModel(doc, { provider: "openrouter", model: "x" });
        const next = turn(doc, "b");
        noteModel(next, { provider: "openrouter", model: "x" });
        expect(next.session.models).toHaveLength(1);
        expect(next.session.models[0]!.lastTurn).toBe(2);
    });

    it("starts a new entry when the model changes", () => {
        const doc = turn(newDocument({}), "a");
        noteModel(doc, { provider: "openrouter", model: "x" });
        noteModel(doc, { provider: "deepseek", model: "y" });
        expect(doc.session.models.map((m) => m.provider)).toEqual(["openrouter", "deepseek"]);
    });

    it("carries no endpoint and no key", () => {
        const doc = turn(newDocument({}), "a");
        noteModel(doc, { provider: "openrouter", model: "x" });
        const text = JSON.stringify(doc);
        expect(text).not.toMatch(/apiKey|baseUrl|Bearer|sk-/);
    });
});

describe("recognising a document", () => {
    it("accepts one it wrote", () => {
        expect(isSessionDocument(turn(newDocument({ historyId: "h1" }), "a"))).toBe(true);
    });

    it("rejects a future schema rather than misreading it", () => {
        const doc = { ...turn(newDocument({}), "a"), olit_session: 99 };
        expect(isSessionDocument(doc)).toBe(false);
    });

    it("rejects junk", () => {
        for (const value of [null, undefined, {}, [], "text", { olit_session: 1 }]) {
            expect(isSessionDocument(value)).toBe(false);
        }
    });
});
