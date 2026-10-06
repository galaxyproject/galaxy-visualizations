/** Galaxy mounts olit as a visualization plugin, so a user can arrive with a dataset chosen.
 *
 * Read here rather than asked of the agent: the history and the summary are lookups, not
 * judgements, and a turn spent on them would cost tokens and a step to say what Galaxy knows.
 */

import { segment, type Galaxy } from "./agent/galaxy";

export interface SeedDataset {
  name: string;
  extension?: string;
  state?: string;
  blurb?: string;
}

/**
 * Where Galaxy launched Olit, as JupyterLite resolves its own: the dataset it was opened on and
 * the history holding it, which is the conversation's history; with no dataset, Galaxy's current
 * history. `problem` says why neither could be read.
 */
export interface Launch {
  historyId?: string;
  dataset?: SeedDataset;
  problem?: string;
}

export async function resolveLaunch(galaxy: Galaxy, datasetId?: string): Promise<Launch> {
  const id = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  try {
    if (!datasetId) {
      return { historyId: id((await galaxy.get("history/current_history_json"))?.id) };
    }
    const d = await galaxy.get(`api/datasets/${segment(datasetId)}`);
    const dataset =
      typeof d?.name === "string"
        ? {
            name: d.name,
            extension: d.extension || undefined,
            state: d.state || undefined,
            blurb: d.misc_blurb || undefined,
          }
        : undefined;
    return { historyId: id(d?.history_id), dataset };
  } catch (e) {
    return { problem: String((e as Error)?.message ?? e) };
  }
}

export function summarize(d: SeedDataset): string {
  const facts = [d.extension, d.blurb, d.state && d.state !== "ok" ? d.state : null]
    .filter(Boolean)
    .join(", ");
  const described = facts ? `${d.name} (${facts})` : d.name;
  return `Starting from ${described}. What would you like to do with it?`;
}
