// Pure placement logic for the floating text-selection "Copy" button.
// Kept DOM-free so the visibility/position decision is unit-testable; the
// chat panel feeds it live selection geometry and applies the result.

export interface CopyButtonRect {
  top: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

export interface CopyButtonInput {
  isCollapsed: boolean;
  rangeCount: number;
  /** Whether the selection range lives inside the chat container. */
  inContainer: boolean;
  /** The selection's viewport-relative bounding rect. */
  rect: CopyButtonRect;
  /**
   * The chat scrollport's viewport-relative top/bottom. The chat container is
   * the scroller, so a selection can stay in the DOM but scroll out of view
   * (autoscroll during streaming). When the selection's rect is entirely above
   * or below this band the button is hidden, instead of being stranded at a
   * stale position over the rest of the pane. The left/right edges bound the
   * button horizontally so it can't escape the chat panel into an adjacent
   * pane when the selection overflows past the container.
   */
  container: { top: number; bottom: number; left: number; right: number };
  viewport: { width: number; height: number };
}

export type CopyButtonPlacement = { hidden: true } | { hidden: false; top: number; left: number };

const BUTTON_HEIGHT = 28;
const BUTTON_WIDTH = 80;
const EDGE_PAD = 4;

export function computeCopyButtonPlacement(input: CopyButtonInput): CopyButtonPlacement {
  const { isCollapsed, rangeCount, inContainer, rect, container, viewport } = input;

  if (isCollapsed || rangeCount === 0) return { hidden: true };
  if (!inContainer) return { hidden: true };
  // A detached/empty selection (e.g. its nodes were re-rendered out from under
  // it during streaming) collapses to a zero-area rect -- treat it as gone.
  if (!rect.width && !rect.height) return { hidden: true };
  // The selection has scrolled entirely out of the chat scrollport (above or
  // below it). The fixed button would otherwise sit at a stale position over
  // the rest of the pane -- the #299 "stranded in the middle" symptom -- so
  // hide it. A partially-visible selection straddling an edge stays shown.
  if (rect.bottom < container.top || rect.top > container.bottom) return { hidden: true };

  const top =
    rect.bottom + 6 + BUTTON_HEIGHT > viewport.height
      ? rect.top - BUTTON_HEIGHT - 4
      : rect.bottom + 4;

  // Anchor the button's right edge to the selection, but never past the chat
  // container's right edge: a horizontally-scrollable block (e.g. a long line
  // in a code block) lays its text out far beyond the visible panel, and the
  // Range rect isn't clipped by that overflow. Clamping to the viewport alone
  // would fling the button into an adjacent pane (#339), so bound left to the
  // container's edges -- still kept on-screen by the viewport as a backstop.
  const desiredLeft = Math.min(rect.right, container.right) - BUTTON_WIDTH;
  const minLeft = Math.max(EDGE_PAD, container.left + EDGE_PAD);
  const maxLeft = Math.min(
    viewport.width - BUTTON_WIDTH - EDGE_PAD,
    container.right - BUTTON_WIDTH - EDGE_PAD,
  );
  const left = Math.max(minLeft, Math.min(desiredLeft, maxLeft));

  return { hidden: false, top, left };
}

/**
 * Identity of a document selection, compared by node reference + offsets.
 * `null` stands for "no usable selection" (none, empty, or collapsed).
 */
export interface SelectionSignature {
  anchorNode: unknown;
  anchorOffset: number;
  focusNode: unknown;
  focusOffset: number;
}

export function selectionSignaturesEqual(
  a: SelectionSignature | null,
  b: SelectionSignature | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.anchorNode === b.anchorNode &&
    a.anchorOffset === b.anchorOffset &&
    a.focusNode === b.focusNode &&
    a.focusOffset === b.focusOffset
  );
}

/**
 * Click-to-dismiss state for the floating Copy button (#377).
 *
 * A click outside the button hides it, but many clicks never collapse the
 * document selection (non-selectable UI chrome, the chat input's internal
 * caret, scrollbars), so re-validating on mouseup used to bring the button
 * straight back. Dismissal therefore records the selection it dismissed:
 * as long as the document selection is still that exact range the button
 * stays hidden, and any real change -- including the collapse at the start
 * of a drag, so re-selecting the same text works -- lifts the suppression.
 */
export class CopyButtonDismissal {
  private suppressed: SelectionSignature | null = null;

  /** The button was dismissed while `current` was selected. */
  suppress(current: SelectionSignature | null): void {
    this.suppressed = current;
  }

  /** The document selection is now `current`; an actual change ends suppression. */
  noteSelectionChange(current: SelectionSignature | null): void {
    if (this.suppressed && !selectionSignaturesEqual(current, this.suppressed)) {
      this.suppressed = null;
    }
  }

  /** Whether showing the button for `current` would undo a dismissal. */
  suppresses(current: SelectionSignature | null): boolean {
    return this.suppressed !== null && selectionSignaturesEqual(current, this.suppressed);
  }
}
