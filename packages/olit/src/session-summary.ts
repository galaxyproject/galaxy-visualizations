/** Shell-written proof a session happened; loom: session-lifecycle.ts + notebook-writer.ts. */

import { editRecord } from "./record-write";

const FENCE_OPEN = "```olit-session";
const FENCE_CLOSE = "```";

export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  record: string;
  orphanedActiveSteps: number;
}

/** loom: renderSessionSummaryYaml(). Same fields, `record` naming the Page rather than a file. */
export function renderSessionSummary(s: SessionSummary): string {
  return (
    [
      FENCE_OPEN,
      `id: ${s.id}`,
      `started_at: ${s.startedAt}`,
      `ended_at: ${s.endedAt}`,
      `record: ${s.record}`,
      `orphaned_active_steps: ${s.orphanedActiveSteps}`,
      FENCE_CLOSE,
    ].join("\n") + "\n"
  );
}

interface BlockRange {
  start: number;
  end: number;
  id: string;
  startedAt: string;
}

function findBlocks(content: string): BlockRange[] {
  const lines = content.split("\n");
  const out: BlockRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== FENCE_OPEN) continue;
    let id = "";
    let startedAt = "";
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].trim();
      if (line === FENCE_CLOSE) {
        out.push({ start: i, end: j, id, startedAt });
        i = j;
        break;
      }
      const m = /^([a-z_]+):\s*(.*)$/.exec(line);
      if (m && m[1] === "id") id = m[2];
      if (m && m[1] === "started_at") startedAt = m[2];
    }
  }
  return out;
}

/**
 * loom: upsertSessionSummaryBlock(). Keyed on session id; keeps the earliest start and the
 * latest end so one block spans the whole session across turns.
 */
export function upsertSessionSummary(content: string, s: SessionSummary): string {
  const matching = findBlocks(content).filter((b) => b.id === s.id);
  if (matching.length === 0) {
    const body = content.replace(/\s*$/, "");
    return `${body}\n\n${renderSessionSummary(s)}`;
  }
  const earliest = matching.reduce(
    (acc, b) => (b.startedAt && b.startedAt < acc ? b.startedAt : acc),
    s.startedAt,
  );
  const block = renderSessionSummary({ ...s, startedAt: earliest })
    .trimEnd()
    .split("\n");
  const drop = new Set<number>();
  for (const b of matching) {
    for (let i = b.start; i <= b.end; i++) drop.add(i);
  }
  const insertAt = matching[0].start;
  const lines = content.split("\n");
  const rebuilt: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === insertAt) rebuilt.push(...block);
    if (drop.has(i)) continue;
    rebuilt.push(lines[i]);
  }
  return rebuilt.join("\n");
}

/**
 * Write the block into the record. loom does this at session end; a browser tab has no
 * reliable end event, so olit upserts after each turn and the latest write wins.
 */
export async function writeSessionSummary(
  root: string,
  credentials: RequestCredentials,
  historyId: string | undefined,
  summary: Omit<SessionSummary, "record">,
): Promise<boolean> {
  if (!historyId) return false;
  return editRecord({ root, credentials, historyId }, (content, recordId) =>
    upsertSessionSummary(content, { ...summary, record: recordId }),
  );
}
