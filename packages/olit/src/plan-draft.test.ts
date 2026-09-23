/** The plan-draft click contract between ChatPanel and main.ts. */

import { beforeEach, describe, expect, it } from "vitest";

import { ChatPanel } from "./orbit/chat/chat-panel";

const BODY = "## Plan A: chrM Variant Calling [galaxy]\n\n- [ ] 1. **QC**";

/** The card exactly as injectPlanFenceCards builds it. */
function mountCard(): HTMLElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    new ChatPanel(el); // attaches the delegated click listener
    el.innerHTML =
        `<div class="plan-draft-card" data-plan-draft-body="${BODY.replace(/"/g, "&quot;")}">` +
        `<div class="plan-draft-card-actions">` +
        `<button type="button" class="plan-btn plan-draft-approve">Approve</button>` +
        `<button type="button" class="plan-btn plan-draft-edit">Edit</button>` +
        `<button type="button" class="plan-btn plan-draft-reject">Reject</button>` +
        `</div></div>`;
    return el;
}

function click(el: HTMLElement, selector: string): Array<{ action: string; body: string }> {
    const seen: Array<{ action: string; body: string }> = [];
    el.addEventListener("plan-draft-action", (e) => seen.push((e as CustomEvent).detail));
    el.querySelector<HTMLButtonElement>(selector)!.click();
    return seen;
}

describe("plan draft card", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    it("reports each action under the name main.ts switches on", () => {
        for (const [selector, action] of [
            [".plan-draft-approve", "approve"],
            [".plan-draft-edit", "edit"],
            [".plan-draft-reject", "reject"],
        ] as const) {
            document.body.innerHTML = "";
            expect(click(mountCard(), selector).map((d) => d.action)).toEqual([action]);
        }
    });

    it("carries the plan body, which is what Edit hands back to the user", () => {
        const seen = click(mountCard(), ".plan-draft-edit");

        expect(seen[0].body).toContain("## Plan A: chrM Variant Calling [galaxy]");
        // No fence: main.ts re-wraps it in ```plan when putting it in the input.
        expect(seen[0].body).not.toContain("```");
    });

    it("locks the card once approved, so a decision cannot be sent twice", () => {
        const el = mountCard();
        click(el, ".plan-draft-approve");

        expect(el.querySelector(".plan-draft-card")!.classList.contains("approved")).toBe(true);
        for (const btn of Array.from(el.querySelectorAll<HTMLButtonElement>(".plan-btn"))) {
            expect(btn.disabled).toBe(true);
        }
    });

    it("marks a rejected card rejected, not approved", () => {
        const el = mountCard();
        click(el, ".plan-draft-reject");

        const card = el.querySelector(".plan-draft-card")!;
        expect(card.classList.contains("rejected")).toBe(true);
        expect(card.classList.contains("approved")).toBe(false);
    });

    it("leaves the card live after Edit — the user is still deciding", () => {
        const el = mountCard();
        click(el, ".plan-draft-edit");

        const card = el.querySelector(".plan-draft-card")!;
        expect(card.classList.contains("approved")).toBe(false);
        expect(card.classList.contains("rejected")).toBe(false);
        expect(el.querySelector<HTMLButtonElement>(".plan-draft-approve")!.disabled).toBe(false);
    });
});
