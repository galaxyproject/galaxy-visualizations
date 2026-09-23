/**
 * Update-banner fallback for when the browser can't be launched.
 *
 * The "Open release page" button asks main to run shell.openExternal. On some
 * environments that quietly fails -- notably WSLg, which often has no default
 * browser / no working xdg-open (#368). Worse, shell.openExternal returns only
 * Promise<void>, so a stub xdg-open that exits 0 without opening anything looks
 * like success. We can't force a browser open, but we can always make the
 * release URL reachable: reveal it as selectable text with a copy button so the
 * user can open it themselves. Kept DOM-only (no electron import) so it can be
 * unit-tested with happy-dom.
 */

export const NEUTRAL_FALLBACK_NOTE = "Release page:";
export const OPEN_FAILED_FALLBACK_NOTE = "Couldn't open your browser automatically. Use this link:";

/** Copy text via the async clipboard API. Never throws -- returns success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const clip = navigator.clipboard;
    if (!clip || typeof clip.writeText !== "function") return false;
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reveal (or update) the copy-the-link fallback inside the update banner.
 * Idempotent: repeated calls reuse the one fallback element and just refresh
 * the note + URL (so a stale "couldn't open" note is reset on a later success).
 * Returns the fallback element.
 */
export function showReleaseFallback(
  banner: HTMLElement,
  url: string,
  note: string = NEUTRAL_FALLBACK_NOTE,
): HTMLElement {
  const doc = banner.ownerDocument;
  let fallback = banner.querySelector<HTMLElement>(".update-banner-fallback");
  if (!fallback) {
    fallback = doc.createElement("div");
    fallback.className = "update-banner-fallback";
    fallback.setAttribute("role", "note");

    const noteEl = doc.createElement("span");
    noteEl.className = "update-banner-fallback-note";

    const urlEl = doc.createElement("span");
    urlEl.className = "update-banner-fallback-url";
    // Let the user select it directly, even if the copy button can't reach a
    // clipboard (some sandboxed/headless environments).
    urlEl.tabIndex = 0;

    const copyBtn = doc.createElement("button");
    copyBtn.className = "update-banner-fallback-copy update-banner-link";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      const current = urlEl.textContent || "";
      void copyToClipboard(current).then((ok) => {
        copyBtn.textContent = ok ? "Copied" : "Copy failed";
      });
      selectElementText(urlEl);
    });

    fallback.append(noteEl, urlEl, copyBtn);
    banner.appendChild(fallback);
  }

  const noteEl = fallback.querySelector<HTMLElement>(".update-banner-fallback-note");
  if (noteEl) noteEl.textContent = note;
  const urlEl = fallback.querySelector<HTMLElement>(".update-banner-fallback-url");
  if (urlEl) urlEl.textContent = url;
  const copyBtn = fallback.querySelector<HTMLElement>(".update-banner-fallback-copy");
  if (copyBtn) copyBtn.textContent = "Copy";
  return fallback;
}

/** Remove the fallback if present. No-op when it was never shown. */
export function clearReleaseFallback(banner: HTMLElement): void {
  banner.querySelector(".update-banner-fallback")?.remove();
}

/**
 * Orchestrates a "Open release page" click: reveal the copyable link up front
 * (so the update is never a dead end even when shell.openExternal resolves
 * without actually opening a browser), attempt the open, and escalate the note
 * to a failure message only when the open is a *confirmed* miss. Takes the open
 * function as a parameter so the wiring is testable without electron.
 */
export async function openReleaseWithFallback(
  banner: HTMLElement,
  url: string,
  open: (url: string) => Promise<{ opened: boolean; url?: string } | undefined>,
): Promise<void> {
  showReleaseFallback(banner, url);
  try {
    const result = await open(url);
    if (!result?.opened) {
      showReleaseFallback(banner, result?.url || url, OPEN_FAILED_FALLBACK_NOTE);
    }
  } catch {
    showReleaseFallback(banner, url, OPEN_FAILED_FALLBACK_NOTE);
  }
}

function selectElementText(el: HTMLElement): void {
  try {
    const selection = el.ownerDocument.defaultView?.getSelection();
    if (!selection) return;
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Selection is a best-effort nicety; ignore environments without it.
  }
}
