import { beforeEach, describe, expect, it } from "vitest";

import { mountArtifactPane } from "./artifact-pane";
import { LAYOUT } from "./layout";

const COLLAPSED_KEY = "olit.artifactCollapsed";

function mount(width: number, withArtifact = true) {
    document.body.className = "";
    document.body.innerHTML = `<div id="app"></div>`;
    const container = document.getElementById("app")!;
    container.innerHTML = LAYOUT;
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    // The pane reads its own contents, so a test about showing needs something to show.
    if (withArtifact) put(container, "<p>chart</p>");
    return { container, pane: mountArtifactPane(container) };
}

/** Fill or empty the pane the way a turn does, and let the observer settle. */
function put(container: HTMLElement, html: string) {
    container.querySelector<HTMLElement>("#artifact-content")!.innerHTML = html;
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const hidden = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("#artifact-btn")!.classList.contains("hidden");

const collapsed = () => document.body.classList.contains("artifact-collapsed");

function resizeTo(width: number) {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    window.dispatchEvent(new Event("resize"));
}

beforeEach(() => localStorage.clear());

describe("artifact pane", () => {
    it("starts collapsed, so the chat gets the whole width", () => {
        mount(1200);
        expect(collapsed()).toBe(true);
    });

    it("opens when something is produced for it, and remembers that", () => {
        const { pane } = mount(1200);
        pane.reveal();
        expect(collapsed()).toBe(false);
        expect(localStorage.getItem(COLLAPSED_KEY)).toBe("0");
    });

    it("restores what the user last chose, not what they chose before that", () => {
        // The preference used to be read once at mount, so a toggle then a resize put the
        // pane back to the stale value.
        const { pane } = mount(1200);
        pane.reveal();
        resizeTo(500);
        expect(collapsed()).toBe(true);
        resizeTo(1200);
        expect(collapsed()).toBe(false);
    });

    it("collapses on a narrow window without forgetting the preference", () => {
        localStorage.setItem(COLLAPSED_KEY, "0");
        mount(500);
        expect(collapsed()).toBe(true);
        expect(localStorage.getItem(COLLAPSED_KEY)).toBe("0");
        resizeTo(1200);
        expect(collapsed()).toBe(false);
    });

    it("toggles from the footer button", () => {
        const { container } = mount(1200);
        const button = container.querySelector<HTMLButtonElement>("#artifact-btn")!;
        button.click();
        expect(collapsed()).toBe(false);
        button.click();
        expect(collapsed()).toBe(true);
    });

    it("stays shut with nothing to show, whatever the remembered preference says", () => {
        localStorage.setItem(COLLAPSED_KEY, "0");
        const { pane } = mount(1200, false);
        expect(collapsed()).toBe(true);
        pane.reveal();
        expect(collapsed()).toBe(true);
    });

    it("offers no button with nothing to show", () => {
        const { container } = mount(1200, false);
        expect(hidden(container)).toBe(true);
    });

    it("offers the button once something is produced", async () => {
        const { container } = mount(1200, false);
        put(container, "<p>chart</p>");
        await settle();
        expect(hidden(container)).toBe(false);
    });

    it("shuts and hides itself when the conversation is reset", async () => {
        // Reset emptied the pane without telling it, leaving the previous chart on screen.
        const { container, pane } = mount(1200);
        pane.reveal();
        expect(collapsed()).toBe(false);
        put(container, "");
        await settle();
        expect(collapsed()).toBe(true);
        expect(hidden(container)).toBe(true);
    });
});
