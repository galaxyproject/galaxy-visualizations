import { defineDoc } from "@earendil-works/pi-durable";

/** What a conversation works in on Galaxy: its id there, history, record page, the dataset it opened on. */
export const Binding = defineDoc<{
  sessionId?: string;
  historyId?: string;
  pageId?: string;
  datasetId?: string;
  startedAt?: string;
}>({
  kind: "olit.binding",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({}),
});

export const MAX_AUTO_FOLLOW_UPS = 3;

/**
 * Whether settled Galaxy work may start a run of its own: `automatic` counts the runs it started
 * since the user last wrote; past the cap, or after a Stop, its follow-ups wait for the user.
 */
export const FollowUps = defineDoc<{ automatic: number; paused: boolean }>({
  kind: "olit.follow-ups",
  version: 2,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ automatic: 0, paused: false }),
});

/** Why settled work waits for the user rather than starting a run, or undefined when it need not. */
export function heldBy(policy: { automatic: number; paused: boolean } | undefined) {
  if (policy?.paused) return "paused" as const;
  if ((policy?.automatic ?? 0) >= MAX_AUTO_FOLLOW_UPS) return "capped" as const;
  return undefined;
}

/**
 * Which conversation each Galaxy history continues, and which conversation holds each saved
 * session as saved: the save it holds, and its last entry then.
 */
export const Sessions = defineDoc<{
  byHistory: Record<string, number>;
  bySaved: Record<string, { conversation: number; updatedAt: string; last?: number }>;
}>({
  kind: "olit.sessions",
  version: 1,
  scope: "session",
  initial: () => ({ byHistory: {}, bySaved: {} }),
});
