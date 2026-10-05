/** Automatic Galaxy follow-up: checking finished work is part of normal execution. */
import { DEFAULT_MAX_AUTO_FOLLOW_UPS } from "./agent/watch";

/** How long to wait after the turn settles before delivering a held follow-up. */
export const FOLLOW_UP_GRACE_MS = 1500;

export interface FollowUpDelivery {
  deliver(text: string): void;
  agentStarted(): void;
  agentSettled(): void;
  /** Real user input: a typed prompt. Lifts any pause. */
  userInput(): void;
  /** The user stopped a turn: drop anything held and pause until they speak. */
  aborted(): void;
}

export interface FollowUpDeliveryOptions {
  graceMs?: number;
  maxConsecutive?: number;
  /** Told once per pause, so results don't sit waiting without the user knowing. */
  onPaused?: (text: string) => void;
}

/** Hold automatic follow-ups while a turn is running and release them once it has settled.
 *
 * An automatic continuation must never act ahead of a "wait, don't run that", so nothing is
 * delivered mid-turn. Each follow-up may submit work whose completion wakes the agent again,
 * so the consecutive count is what stops an unattended tab running indefinitely.
 */
export function createFollowUpDelivery(
  send: (text: string) => void,
  opts: FollowUpDeliveryOptions = {},
): FollowUpDelivery {
  const graceMs = opts.graceMs ?? FOLLOW_UP_GRACE_MS;
  const max = opts.maxConsecutive ?? DEFAULT_MAX_AUTO_FOLLOW_UPS;
  let busy = false;
  let held: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let consecutive = 0;
  let stopped = false;
  let pauseAnnounced = false;

  const cancelTimer = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;
  };
  /** Whether the batch went out. A pause holds it rather than consuming it. */
  const sendNow = (texts: string[]) => {
    if (texts.length === 0) {
      return true;
    }
    if (stopped || consecutive >= max) {
      if (!pauseAnnounced) {
        pauseAnnounced = true;
        opts.onPaused?.(
          stopped
            ? "Galaxy results are waiting -- automatic follow-up is paused since you stopped. Say continue when you're ready."
            : `Galaxy results are waiting -- automatic follow-up paused after ${consecutive} automatic turn(s). Say continue to resume.`,
        );
      }
      return false;
    }
    consecutive++;
    // Several held batches become one turn rather than several.
    send(texts.join("\n\n"));
    return true;
  };
  const flush = () => {
    timer = null;
    // A pause keeps the batch: the watcher has already dropped these ids and will not
    // report them again, so letting it go loses the results outright.
    if (sendNow(held)) {
      held = [];
    }
  };

  return {
    deliver(text) {
      held.push(text);
      if (!busy && !timer) {
        flush();
      }
    },
    agentStarted() {
      busy = true;
      cancelTimer();
    },
    agentSettled() {
      busy = false;
      if (held.length === 0) {
        return;
      }
      cancelTimer();
      timer = setTimeout(flush, graceMs);
    },
    userInput() {
      consecutive = 0;
      stopped = false;
      pauseAnnounced = false;
    },
    aborted() {
      cancelTimer();
      stopped = true;
    },
  };
}
