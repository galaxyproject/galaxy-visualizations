import { renderMarkdown } from "./markdown.js";
import { joinTextBlocks } from "./block-spacing.js";
import {
  computeCopyButtonPlacement,
  CopyButtonDismissal,
  selectionSignaturesEqual,
  type SelectionSignature,
} from "./copy-button.js";
import { copyToClipboard } from "../update-banner.js";
import {
  TEAM_DISPATCH_KIND,
  type TeamDispatchDetails,
} from "../shared/team-dispatch-contract.js";
import type {
  ParameterFormPayload,
  ParameterGroup,
  ParameterSpec,
} from "../shared/loom-shell-contract.js";

export type MessageRecord =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "tool"; id: string; name: string; status: string; result?: string }
  | { role: "info"; text: string }
  | { role: "error"; text: string };

export class ChatPanel {
  private container: HTMLElement;
  private currentMessage: HTMLElement | null = null;
  private currentText = "";
  // When true, the next streamed delta starts a new assistant text block and is
  // separated from the prior block with a blank line (issue #200) so successive
  // segments around tool calls don't render butted together ("Galaxy.Creating").
  private pendingBlockBreak = false;
  private toolCards = new Map<string, HTMLElement>();
  private scrollLocked = true;
  private thinkingEl: HTMLElement | null = null;
  private cwd = "";
  private promptCounter = 0;
  // Track the most recent error message so consecutive duplicates (e.g. the
  // brain auto-retrying through an overloaded API) collapse to one card.
  private lastErrorEl: HTMLElement | null = null;
  private lastErrorText = "";
  private lastErrorCount = 0;
  private history: MessageRecord[] = [];
  // Assistant text accumulated since the last export flush (message start or a
  // tool card). Flushed as its own record so prose keeps its order around tool
  // cards instead of all collapsing to one block pushed at message end.
  private pendingSegment = "";
  private copyBtn: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.copyBtn = this.initCopyButton();

    this.container.addEventListener("copy", (e) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const frag = sel.getRangeAt(0).cloneContents();
      const tmp = document.createElement("div");
      tmp.appendChild(frag);
      const md = fragmentToMarkdown(tmp);
      e.preventDefault();
      e.clipboardData!.setData("text/plain", md);
    });

    this.container.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = this.container;
      this.scrollLocked = scrollHeight - scrollTop - clientHeight < 40;
    });

    this.container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest<HTMLButtonElement>(
        ".plan-draft-approve,.plan-draft-edit,.plan-draft-reject",
      );
      if (!btn) return;
      const card = btn.closest<HTMLElement>(".plan-draft-card");
      const body = card?.dataset.planDraftBody ?? "";
      let action: "approve" | "edit" | "reject" = "approve";
      if (btn.classList.contains("plan-draft-edit")) action = "edit";
      else if (btn.classList.contains("plan-draft-reject")) action = "reject";
      if (action !== "edit" && card) {
        card.classList.add(action === "approve" ? "approved" : "rejected");
        card
          .querySelectorAll<HTMLButtonElement>(
            ".plan-draft-approve,.plan-draft-edit,.plan-draft-reject",
          )
          .forEach((b) => {
            b.disabled = true;
          });
      }
      this.container.dispatchEvent(
        new CustomEvent("plan-draft-action", {
          detail: { action, body },
          bubbles: true,
        }),
      );
    });
  }

  /**
   * Bind the chat panel to a cwd. The prompt counter is **not** persisted
   * across sessions — it's derived live from rendered turns. After replay
   * (which calls \`addReplayUserMessage\` for every user-role entry in
   * session.jsonl) the counter equals the replay max; live submissions
   * grow it from there. This avoids drift caused by local-only slash
   * commands (e.g. /help, /cost, /summarize) which add a turn in chat
   * but don't go into session.jsonl, so on restart they wouldn't be
   * replayed but their counter increments would have leaked through a
   * persisted store.
   */
  setCwd(cwd: string): void {
    this.cwd = cwd;
    this.promptCounter = 0;
  }

  /** Reset the in-memory counter — only for /new sessions. */
  resetCounter(): void {
    this.promptCounter = 0;
  }

  addUserMessage(text: string): void {
    this.history.push({ role: "user", text });
    this.resetErrorDedup();
    const n = ++this.promptCounter;
    const turn = document.createElement("div");
    turn.className = "user-turn";
    turn.dataset.promptNum = String(n);

    const num = document.createElement("div");
    num.className = "prompt-num";
    num.textContent = String(n);
    num.title = `Prompt ${n}`;

    const connector = document.createElement("div");
    connector.className = "prompt-connector";

    const bubble = document.createElement("div");
    bubble.className = "message user";
    bubble.textContent = text;

    turn.appendChild(num);
    turn.appendChild(connector);
    turn.appendChild(bubble);
    this.container.appendChild(turn);
    this.scrollToBottom();
  }

  /**
   * Replay a historical user message with a fixed number (session history
   * restore). The counter is set, not max'd — replay is authoritative and
   * passes monotonically increasing numbers, so after the last call the
   * counter equals the replay's count. Live numbers continue from there.
   */
  addReplayUserMessage(text: string, promptNum: number): void {
    this.history.push({ role: "user", text });
    this.resetErrorDedup();
    this.promptCounter = promptNum;
    const turn = document.createElement("div");
    turn.className = "user-turn";
    turn.dataset.promptNum = String(promptNum);

    const num = document.createElement("div");
    num.className = "prompt-num";
    num.textContent = String(promptNum);
    num.title = `Prompt ${promptNum}`;

    const connector = document.createElement("div");
    connector.className = "prompt-connector";

    const bubble = document.createElement("div");
    bubble.className = "message user";
    bubble.textContent = text;

    turn.appendChild(num);
    turn.appendChild(connector);
    turn.appendChild(bubble);
    this.container.appendChild(turn);
    this.scrollToBottom();
  }

  /** Wipe all chat messages and reset internal state. Counter preserved — use resetCounter() for /new. */
  clear(): void {
    this.container.innerHTML = "";
    this.currentMessage = null;
    this.currentText = "";
    this.pendingSegment = "";
    this.pendingBlockBreak = false;
    this.toolCards.clear();
    this.thinkingEl = null;
    this.history = [];
  }

  showThinking(): void {
    this.hideThinking();
    const el = document.createElement("div");
    el.className = "message assistant thinking-indicator";
    el.innerHTML =
      '<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span> thinking';
    this.thinkingEl = el;
    this.container.appendChild(el);
    this.scrollToBottom();
  }

  hideThinking(): void {
    if (this.thinkingEl) {
      this.thinkingEl.remove();
      this.thinkingEl = null;
    }
  }

  hasActiveMessage(): boolean {
    return this.currentMessage !== null;
  }

  hasContent(): boolean {
    return this.container.children.length > 0;
  }

  getPromptCount(): number {
    return this.promptCounter;
  }

  /**
   * Build a plain-text transcript of turns in the inclusive prompt-number range.
   * Each turn: the user prompt text, then everything that followed until the
   * next user-turn (assistant messages, tool cards). Used by /summarize.
   */
  getTranscript(fromNum: number, toNum: number): string {
    const lo = Math.min(fromNum, toNum);
    const hi = Math.max(fromNum, toNum);
    const children = Array.from(this.container.children) as HTMLElement[];
    const parts: string[] = [];
    let activeNum: number | null = null;
    let buf: string[] = [];

    const flush = () => {
      if (activeNum !== null && activeNum >= lo && activeNum <= hi) {
        parts.push(buf.join("\n").trimEnd());
      }
      buf = [];
    };

    for (const el of children) {
      if (el.classList.contains("user-turn")) {
        flush();
        const n = Number(el.dataset.promptNum);
        activeNum = Number.isFinite(n) ? n : null;
        const userText =
          (el.querySelector(".message.user") as HTMLElement | null)?.textContent?.trim() ?? "";
        if (activeNum !== null) {
          buf.push(`[Prompt ${activeNum} — user]`);
          if (userText) buf.push(userText);
        }
      } else if (activeNum !== null && activeNum >= lo && activeNum <= hi) {
        const text = (el.textContent ?? "").trim();
        if (!text) continue;
        if (el.classList.contains("message") && el.classList.contains("assistant")) {
          buf.push(`[Prompt ${activeNum} — assistant]`);
          buf.push(text);
        } else {
          buf.push(text);
        }
      }
    }
    flush();
    return parts.join("\n\n---\n\n");
  }

  startAssistantMessage(): void {
    this.currentText = "";
    this.pendingSegment = "";
    this.pendingBlockBreak = false;
    const el = document.createElement("div");
    el.className = "message assistant";
    el.innerHTML = '<span class="cursor-blink"></span>';
    this.container.appendChild(el);
    this.currentMessage = el;
    this.scrollToBottom();
  }

  /**
   * Mark that the current assistant text block has ended (a tool call or a new
   * assistant message follows). The next streamed delta then opens a new block,
   * separated from the previous one by a blank line so they don't run together
   * in the rendered markdown (issue #200). No-op once the message is finished.
   */
  separateNextBlock(): void {
    if (this.currentMessage) this.pendingBlockBreak = true;
  }

  appendDelta(delta: string): void {
    if (!this.currentMessage) return;
    if (this.pendingBlockBreak) {
      this.pendingBlockBreak = false;
      this.currentText = joinTextBlocks(this.currentText, delta);
      this.pendingSegment = joinTextBlocks(this.pendingSegment, delta);
    } else {
      this.currentText += delta;
      this.pendingSegment += delta;
    }
    this.renderCurrentMessage();
    this.scrollToBottom();
  }

  finishAssistantMessage(): void {
    if (this.currentMessage) {
      this.renderCurrentMessage();
    }
    // Clean up any stray cursors across the whole container
    this.container.querySelectorAll(".cursor-blink").forEach((c) => c.remove());
    this.flushAssistantSegment();
    this.currentMessage = null;
    this.currentText = "";
    this.pendingBlockBreak = false;
  }

  /**
   * Push the assistant text accumulated since the last flush as one export
   * record. Called at each tool card and at message end so prose keeps its
   * position relative to tool cards.
   */
  private flushAssistantSegment(): void {
    const segment = this.pendingSegment.trim();
    if (segment) this.history.push({ role: "assistant", text: segment });
    this.pendingSegment = "";
  }

  addToolCard(id: string, name: string): void {
    this.flushAssistantSegment();
    this.history.push({ role: "tool", id, name, status: "running" });
    const card = document.createElement("div");
    card.className = "tool-card";
    card.innerHTML = `
      <div class="tool-card-header">
        <span class="tool-status running"></span>
        <span>${escapeHtml(name)}</span>
      </div>
      <div class="tool-card-body"></div>
    `;

    card.querySelector(".tool-card-header")!.addEventListener("click", () => {
      card.classList.toggle("expanded");
    });

    this.toolCards.set(id, card);

    // Insert into current assistant message or append to container
    if (this.currentMessage) {
      // Insert before the cursor
      const cursor = this.currentMessage.querySelector(".cursor-blink");
      if (cursor) {
        this.currentMessage.insertBefore(card, cursor);
      } else {
        this.currentMessage.appendChild(card);
      }
    } else {
      this.container.appendChild(card);
    }

    this.scrollToBottom();
  }

  updateToolCard(
    id: string,
    status: "running" | "done" | "error",
    result?: string,
    details?: TeamDispatchDetails | { kind?: string; [k: string]: unknown },
  ): void {
    const card = this.toolCards.get(id);
    if (!card) return;

    const dot = card.querySelector(".tool-status")!;
    dot.className = `tool-status ${status}`;

    // Sync the export record up front, keyed by id. The team_dispatch branch
    // below returns early, so doing this here keeps those records from being
    // frozen at "running"; matching on id (not the rendered name) stops two
    // same-named tools in a turn from clobbering each other.
    const rec = this.history.findLast((r) => r.role === "tool" && r.id === id);
    if (rec && rec.role === "tool") {
      rec.status = status;
      if (result) rec.result = result.slice(0, 2000);
    }

    // Specialized branch: team_dispatch details render as a collapsible card.
    if (details && (details as { kind?: string }).kind === TEAM_DISPATCH_KIND) {
      const body = card.querySelector(".tool-card-body")!;
      body.textContent = "";
      body.appendChild(renderTeamDispatchCard(details as TeamDispatchDetails));
      return;
    }

    if (result) {
      const body = card.querySelector(".tool-card-body")!;
      body.textContent = result.slice(0, 2000);
    }
  }

  private resetErrorDedup(): void {
    this.lastErrorEl = null;
    this.lastErrorText = "";
    this.lastErrorCount = 0;
  }

  addErrorMessage(text: string): void {
    // Flush any prose streamed before this error so the export keeps order.
    this.flushAssistantSegment();
    if (this.lastErrorEl && this.lastErrorText === text) {
      this.lastErrorCount += 1;
      this.lastErrorEl.textContent = `${text}  (x${this.lastErrorCount})`;
      this.scrollToBottom();
      return;
    }
    // Record only when a new card is actually rendered -- duplicates collapse
    // into the card above, so one record per visible card keeps the export in
    // sync with what the user sees.
    this.history.push({ role: "error", text });
    const el = document.createElement("div");
    el.className = "message assistant";
    el.style.color = "var(--error)";
    el.textContent = text;
    this.container.appendChild(el);
    this.lastErrorEl = el;
    this.lastErrorText = text;
    this.lastErrorCount = 1;
    this.scrollToBottom();
  }

  /**
   * Render a parameter-review form card (from the `analyze_plan_parameters`
   * tool). `onSubmit` receives the flattened `{name: value}` dict when the
   * user clicks "Use these parameters".
   */
  addParameterCard(
    payload: ParameterFormPayload,
    onSubmit: (values: Record<string, string | number | boolean>) => void,
  ): void {
    const card = renderParameterCard(payload, onSubmit);
    this.container.appendChild(card);
    this.scrollToBottom();
  }

  /** Add a system/info message with neutral styling and HTML support. */
  addInfoMessage(html: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "message assistant system-info";
    el.innerHTML = html;
    this.container.appendChild(el);
    this.scrollToBottom();
    return el;
  }

  /** Export the current conversation as a Markdown string. */
  exportAsMarkdown(): string {
    return historyToMarkdown(this.history);
  }

  private initCopyButton(): HTMLElement {
    const COPY_LABEL = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
    const btn = document.createElement("button");
    btn.className = "chat-copy-btn";
    btn.hidden = true;
    btn.innerHTML = COPY_LABEL;
    document.body.appendChild(btn);

    // selectionchange fires while a mousedown is still in progress and the old
    // selection is still live, which would immediately re-show the button we
    // just hid. Track mousedown state so selectionchange can't re-show it.
    let mouseIsDown = false;

    // #377: many clicks never collapse the selection (non-selectable chrome,
    // the chat input, scrollbars), so hiding on mousedown isn't enough -- the
    // mouseup/selectionchange re-validation would bring the button right back.
    const dismissal = new CopyButtonDismissal();

    // Bumped whenever the document selection collapses/empties: a later
    // selection with an identical signature is then a NEW selection (the user
    // re-selected the same text), not the one a pending copy acted on.
    let selectionEpoch = 0;

    const currentSignature = (): SelectionSignature | null => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      return {
        anchorNode: sel.anchorNode,
        anchorOffset: sel.anchorOffset,
        focusNode: sel.focusNode,
        focusOffset: sel.focusOffset,
      };
    };

    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection alive on button click

    document.addEventListener("mousedown", (e) => {
      // contains() so clicking the button's inner <svg> (a child) still counts
      // as the button -- otherwise the icon hit hides it before the copy fires.
      if (!btn.contains(e.target as Node)) {
        btn.hidden = true;
        mouseIsDown = true;
        dismissal.suppress(currentSignature());
      }
    });
    document.addEventListener("mouseup", () => {
      mouseIsDown = false;
      updateBtn();
    });
    window.addEventListener("blur", () => {
      btn.hidden = true;
    });

    btn.addEventListener("click", () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        btn.hidden = true;
        return;
      }
      const frag = sel.getRangeAt(0).cloneContents();
      const tmp = document.createElement("div");
      tmp.appendChild(frag);
      const md = fragmentToMarkdown(tmp);
      // Snapshot what was copied: by the time the clipboard settles or the
      // confirmation beat ends, the user may have selected something else,
      // and that newer selection must be neither cleared nor suppressed.
      const copied = currentSignature();
      const epoch = selectionEpoch;
      // The copied selection is still the live one: same signature, and no
      // collapse in between (which would make an identical signature a new,
      // re-selected range rather than this one).
      const copiedSelectionIsLive = () =>
        epoch === selectionEpoch && selectionSignaturesEqual(currentSignature(), copied);
      void copyToClipboard(md).then((ok) => {
        if (ok) {
          btn.textContent = "✓ Copied";
        } else {
          // Clipboard unavailable/refused: don't claim success, and keep the
          // selection so Cmd/Ctrl+C still works -- just stop showing the
          // button for it.
          if (copiedSelectionIsLive()) dismissal.suppress(copied);
          btn.textContent = "✗ Copy failed";
        }
        setTimeout(() => {
          btn.innerHTML = COPY_LABEL;
          if (ok && copiedSelectionIsLive()) {
            btn.hidden = true;
            window.getSelection()?.removeAllRanges();
          } else {
            // The user moved on (or the copy failed): leave the selection
            // alone and let the usual rules decide visibility.
            updateBtn();
          }
        }, 1200);
      });
    });

    // Keyboard selection (Shift+arrow, Ctrl+A, etc.) — selectionchange is safe
    // here because there's no mousedown race.
    document.addEventListener("selectionchange", () => {
      const sig = currentSignature();
      if (sig === null) selectionEpoch++;
      dismissal.noteSelectionChange(sig);
      if (mouseIsDown) return;
      updateBtn();
    });

    // The button is position:fixed at the selection's viewport coords, but the
    // chat re-renders and autoscrolls during streaming. Without re-validating on
    // scroll the button stays frozen where the selection used to be, stranded in
    // the middle of the pane (#299). Re-running updateBtn repositions it to track
    // the selection, or hides it once the selection scrolls away / is gone.
    this.container.addEventListener("scroll", () => updateBtn());

    // A guaranteed dismiss: Escape clears the selection and hides the button.
    // Scoped to when the button is showing so it never disturbs selections
    // elsewhere (e.g. in an input).
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !btn.hidden) {
        btn.hidden = true;
        window.getSelection()?.removeAllRanges();
      }
    });

    const updateBtn = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        btn.hidden = true;
        return;
      }
      // A dismissed-but-surviving selection stays dismissed (#377).
      if (dismissal.suppresses(currentSignature())) {
        btn.hidden = true;
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const crect = this.container.getBoundingClientRect();
      const placement = computeCopyButtonPlacement({
        isCollapsed: sel.isCollapsed,
        rangeCount: sel.rangeCount,
        inContainer: this.container.contains(range.commonAncestorContainer),
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
        container: { top: crect.top, bottom: crect.bottom, left: crect.left, right: crect.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      if (placement.hidden) {
        btn.hidden = true;
        return;
      }
      btn.hidden = false;
      btn.style.top = `${placement.top}px`;
      btn.style.left = `${placement.left}px`;
    };

    return btn;
  }

  private renderCurrentMessage(): void {
    if (!this.currentMessage) return;

    // Preserve tool cards
    const cards = Array.from(this.currentMessage.querySelectorAll(".tool-card"));

    const { text, planBlocks } = extractPlanFences(this.currentText);
    let html = renderMarkdown(text);
    html = injectPlanFenceCards(html, planBlocks);
    this.currentMessage.innerHTML = html + '<span class="cursor-blink"></span>';

    // Re-insert tool cards before the cursor
    const cursor = this.currentMessage.querySelector(".cursor-blink");
    for (const card of cards) {
      if (cursor) {
        this.currentMessage.insertBefore(card, cursor);
      } else {
        this.currentMessage.appendChild(card);
      }
    }
  }

  private scrollToBottom(): void {
    if (this.scrollLocked) {
      requestAnimationFrame(() => {
        this.container.scrollTop = this.container.scrollHeight;
      });
    }
  }
}

export function historyToMarkdown(records: MessageRecord[]): string {
  const lines: string[] = [];
  for (const rec of records) {
    if (rec.role === "user") {
      lines.push(`**You**\n\n${rec.text}\n`);
    } else if (rec.role === "assistant") {
      lines.push(`**Assistant**\n\n${rec.text}\n`);
    } else if (rec.role === "tool") {
      const badge = rec.status === "done" ? "✓" : rec.status === "error" ? "✗" : "…";
      lines.push(
        `*Tool call ${badge}: \`${rec.name}\`*${rec.result ? `\n\n\`\`\`\n${rec.result}\n\`\`\`` : ""}\n`,
      );
    } else if (rec.role === "error") {
      lines.push(`*Error: ${rec.text}*\n`);
    }
  }
  return lines.join("\n---\n\n");
}

export function fragmentToMarkdown(el: HTMLElement): string {
  return nodeToMd(el).trim();
}

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = () => Array.from(el.childNodes).map(nodeToMd).join("");

  switch (tag) {
    case "strong":
    case "b":
      return `**${inner()}**`;
    case "em":
    case "i":
      return `*${inner()}*`;
    case "del":
    case "s":
      return `~~${inner()}~~`;
    case "code":
      if (el.closest("pre")) return el.textContent ?? "";
      return `\`${el.textContent ?? ""}\``;
    case "pre": {
      const code = el.querySelector("code");
      const lang = (code?.className ?? "").match(/language-(\w+)/)?.[1] ?? "";
      return `\`\`\`${lang}\n${(code ?? el).textContent ?? ""}\n\`\`\``;
    }
    case "h1":
      return `# ${inner()}\n`;
    case "h2":
      return `## ${inner()}\n`;
    case "h3":
      return `### ${inner()}\n`;
    case "h4":
      return `#### ${inner()}\n`;
    case "h5":
      return `##### ${inner()}\n`;
    case "h6":
      return `###### ${inner()}\n`;
    case "p":
      return `${inner()}\n\n`;
    case "br":
      return "\n";
    case "ul":
      return (
        Array.from(el.children)
          .map((li) => `- ${nodeToMd(li)}`)
          .join("\n") + "\n"
      );
    case "ol":
      return (
        Array.from(el.children)
          .map((li, i) => `${i + 1}. ${nodeToMd(li)}`)
          .join("\n") + "\n"
      );
    case "li":
      return inner();
    case "a":
      return `[${inner()}](${el.getAttribute("href") ?? ""})`;
    case "blockquote":
      return inner()
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "hr":
      return "---\n";
    default:
      return inner();
  }
}

function escapeHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

const PLAN_FENCE_PLACEHOLDER_PREFIX = "LOOM_PLAN_FENCE_";

/**
 * Strip ```plan ... ``` fences out of assistant markdown before marked.parse.
 * Leaves a placeholder paragraph behind so the surrounding prose keeps its
 * position; extractPlanFences + injectPlanFenceCards swap the placeholders
 * for rendered draft cards. A trailing unclosed fence is treated as still
 * in-progress and rendered as a card with whatever text has arrived so far.
 */
function extractPlanFences(src: string): { text: string; planBlocks: string[] } {
  const planBlocks: string[] = [];
  const re = /```plan\b[^\n]*\n([\s\S]*?)```/g;
  let text = src.replace(re, (_m, body: string) => {
    const idx = planBlocks.push(body) - 1;
    return `\n\n${PLAN_FENCE_PLACEHOLDER_PREFIX}${idx}\n\n`;
  });
  const openMatch = /```plan\b[^\n]*\n([\s\S]*)$/.exec(text);
  if (openMatch) {
    const idx = planBlocks.push(openMatch[1]) - 1;
    text = text.slice(0, openMatch.index) + `\n\n${PLAN_FENCE_PLACEHOLDER_PREFIX}${idx}\n\n`;
  }
  return { text, planBlocks };
}

function injectPlanFenceCards(html: string, planBlocks: string[]): string {
  if (planBlocks.length === 0) return html;
  const re = new RegExp(`<p>\\s*${PLAN_FENCE_PLACEHOLDER_PREFIX}(\\d+)\\s*</p>`, "g");
  return html.replace(re, (_m, idxStr: string) => {
    const idx = Number(idxStr);
    const body = planBlocks[idx] ?? "";
    const bodyHtml = renderMarkdown(body);
    const bodyAttr = escapeAttr(body);
    return (
      `<div class="plan-draft-card" data-plan-draft-body="${bodyAttr}">` +
      `<div class="plan-draft-card-header">Plan draft — awaiting your approval</div>` +
      `<div class="plan-draft-card-body">${bodyHtml}</div>` +
      `<div class="plan-draft-card-actions">` +
      `<button type="button" class="plan-btn plan-draft-approve">Approve</button>` +
      `<button type="button" class="plan-btn plan-draft-edit">Edit</button>` +
      `<button type="button" class="plan-btn plan-draft-reject">Reject</button>` +
      `</div>` +
      `</div>`
    );
  });
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderTeamDispatchCard(details: TeamDispatchDetails): HTMLElement {
  const { spec, turns = [], summary } = details;
  const wrapper = document.createElement("div");
  wrapper.className = "team-dispatch-card";

  const header = document.createElement("button");
  header.className = "team-dispatch-header";
  header.type = "button";
  const roleLabels = (spec?.roles ?? []).map((r) => r.name).join(" × ");
  header.textContent = `${roleLabels || "Team"} — ${summary ?? `${turns.length} turn(s)`}`;

  const body = document.createElement("div");
  body.className = "team-dispatch-body hidden";

  for (const t of turns) {
    const row = document.createElement("div");
    row.className = "team-turn";
    const meta = document.createElement("div");
    meta.className = "team-turn-meta";
    const approvedMark = t.approved === true ? " ✓" : t.approved === false ? " ✗" : "";
    meta.textContent = `Round ${t.round} — ${t.role}${approvedMark}`;
    const content = document.createElement("pre");
    content.className = "team-turn-content";
    content.textContent = t.content ?? "";
    row.appendChild(meta);
    row.appendChild(content);
    body.appendChild(row);
  }

  header.addEventListener("click", () => body.classList.toggle("hidden"));
  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

// ── Parameter form card ──────────────────────────────────────────────────────

function renderParameterCard(
  payload: ParameterFormPayload,
  onSubmit: (values: Record<string, string | number | boolean>) => void,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "param-form-card";

  // Header
  const header = document.createElement("div");
  header.className = "param-form-header";
  const title = document.createElement("div");
  title.className = "param-form-title";
  title.textContent = payload.title || "Parameters";
  const desc = document.createElement("div");
  desc.className = "param-form-desc";
  desc.textContent = payload.description || "";
  header.appendChild(title);
  if (payload.description) header.appendChild(desc);
  card.appendChild(header);

  // Groups + inputs — `inputs` maps param name → input element reading function
  const readers = new Map<string, () => string | number | boolean>();

  for (const group of payload.groups ?? []) {
    card.appendChild(renderGroup(group, readers));
  }

  // Actions
  const actions = document.createElement("div");
  actions.className = "param-form-actions";
  const useBtn = document.createElement("button");
  useBtn.type = "button";
  useBtn.className = "plan-btn execute param-form-submit";
  useBtn.textContent = "Use these parameters";
  useBtn.addEventListener("click", () => {
    const values: Record<string, string | number | boolean> = {};
    for (const [name, read] of readers) values[name] = read();
    onSubmit(values);
  });
  actions.appendChild(useBtn);
  card.appendChild(actions);

  return card;
}

function renderGroup(
  group: ParameterGroup,
  readers: Map<string, () => string | number | boolean>,
): HTMLElement {
  const groupEl = document.createElement("div");
  groupEl.className = "param-form-group";

  const groupTitle = document.createElement("div");
  groupTitle.className = "param-form-group-title";
  groupTitle.textContent = group.title || "";
  groupEl.appendChild(groupTitle);

  if (group.description) {
    const groupDesc = document.createElement("div");
    groupDesc.className = "param-form-group-desc";
    groupDesc.textContent = group.description;
    groupEl.appendChild(groupDesc);
  }

  for (const p of group.params ?? []) {
    groupEl.appendChild(renderParamRow(p, readers));
  }
  return groupEl;
}

function renderParamRow(
  p: ParameterSpec,
  readers: Map<string, () => string | number | boolean>,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "param-form-row";

  const labelWrap = document.createElement("div");
  labelWrap.className = "param-form-label-wrap";
  const label = document.createElement("label");
  label.className = "param-form-label";
  label.textContent = p.label || p.name;
  label.htmlFor = `param-${cssEscape(p.name)}`;
  labelWrap.appendChild(label);
  if (p.usedBy && p.usedBy.length > 0) {
    const usedBy = document.createElement("div");
    usedBy.className = "param-form-used-by";
    usedBy.textContent = `used by: ${p.usedBy.join(", ")}`;
    labelWrap.appendChild(usedBy);
  }
  if (p.help) {
    const help = document.createElement("div");
    help.className = "param-form-help";
    help.textContent = p.help;
    labelWrap.appendChild(help);
  }
  row.appendChild(labelWrap);

  const inputWrap = document.createElement("div");
  inputWrap.className = "param-form-input-wrap";

  switch (p.type) {
    case "boolean": {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = label.htmlFor;
      input.checked = Boolean(p.value);
      readers.set(p.name, () => input.checked);
      inputWrap.appendChild(input);
      break;
    }
    case "select": {
      const input = document.createElement("select");
      input.id = label.htmlFor;
      input.className = "param-form-input";
      for (const opt of p.options ?? []) {
        const optEl = document.createElement("option");
        optEl.value = opt.value;
        optEl.textContent = opt.label;
        input.appendChild(optEl);
      }
      input.value = String(p.value);
      readers.set(p.name, () => input.value);
      inputWrap.appendChild(input);
      break;
    }
    case "integer":
    case "float": {
      const input = document.createElement("input");
      input.type = "number";
      input.id = label.htmlFor;
      input.className = "param-form-input";
      if (typeof p.min === "number") input.min = String(p.min);
      if (typeof p.max === "number") input.max = String(p.max);
      if (typeof p.step === "number") {
        input.step = String(p.step);
      } else if (p.type === "float") {
        input.step = "any";
      }
      input.value = String(p.value ?? "");
      readers.set(p.name, () => {
        const raw = input.value.trim();
        if (raw === "") return p.type === "integer" ? 0 : 0;
        return p.type === "integer" ? parseInt(raw, 10) : parseFloat(raw);
      });
      inputWrap.appendChild(input);
      break;
    }
    case "file":
    case "text":
    default: {
      const input = document.createElement("input");
      input.type = "text";
      input.id = label.htmlFor;
      input.className = "param-form-input";
      input.value = String(p.value ?? "");
      if (p.type === "file" && p.fileFilter) {
        input.placeholder = `path (filter: ${p.fileFilter})`;
      }
      readers.set(p.name, () => input.value);
      inputWrap.appendChild(input);
      break;
    }
  }

  row.appendChild(inputWrap);
  return row;
}

/** Cheap id-safe escape — we only use this for element ids, not CSS selectors. */
function cssEscape(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}
