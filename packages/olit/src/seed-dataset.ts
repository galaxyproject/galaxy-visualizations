/** Galaxy mounts olit as a visualization plugin, so a user can arrive with a dataset chosen.
 *
 * Read here rather than asked of the agent: the summary is a lookup, not a judgement, and a
 * turn spent on it would cost tokens and a step to say what Galaxy already knows.
 */

export interface SeedDataset {
  name: string;
  extension?: string;
  state?: string;
  blurb?: string;
}

/** A one-line summary of the dataset olit was opened on, or null if there is nothing to say. */
export async function describeSeedDataset(
  root: string,
  credentials: RequestCredentials,
  datasetId: string,
): Promise<SeedDataset | null> {
  try {
    const res = await fetch(`${root}api/datasets/${datasetId}`, { credentials });
    if (!res.ok) {
      return null;
    }
    const d = await res.json();
    if (!d || typeof d.name !== "string") {
      return null;
    }
    return {
      name: d.name,
      extension: d.extension || undefined,
      state: d.state || undefined,
      blurb: d.misc_blurb || undefined,
    };
  } catch (e) {
    console.warn("[olit] could not read the starting dataset", e);
    return null;
  }
}

export function summarize(d: SeedDataset): string {
  const facts = [d.extension, d.blurb, d.state && d.state !== "ok" ? d.state : null]
    .filter(Boolean)
    .join(", ");
  const described = facts ? `${d.name} (${facts})` : d.name;
  return `Starting from ${described}. What would you like to do with it?`;
}
