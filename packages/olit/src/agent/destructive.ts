import type { BeforeToolCallContext, BeforeToolCallResult } from "@earendil-works/pi-agent-core";

interface Destructive {
  irreversible: boolean;
  historyId?: string;
}

export type Ask = (title: string, message: string) => Promise<boolean>;

/** The structured half of loom's classifier. */
export function classify(name: string, args: Record<string, unknown>): Destructive | undefined {
  if (name.toLowerCase().replace(/^galaxy_/, "") !== "update_history") {
    return undefined;
  }
  if (args.purged !== true && args.deleted !== true) {
    return undefined;
  }
  const historyId = typeof args.history_id === "string" ? args.history_id : undefined;
  return { irreversible: args.purged === true, historyId };
}

export function describe({ irreversible, historyId }: Destructive): string {
  if (irreversible) {
    const target = historyId ? `history ${historyId}` : "the entire history";
    return `Permanently PURGE ${target} — this deletes all of its datasets and cannot be undone.`;
  }
  const suffix = historyId ? ` (${historyId})` : "";
  return (
    `Mark the entire history${suffix} as deleted — not just specific datasets. ` +
    "Recoverable via Undelete on most Galaxy servers, but it affects the whole history."
  );
}

/** Asks when someone can answer, refuses when nobody can; never cached. */
export function destructiveGate(ask?: Ask) {
  return async ({
    toolCall,
    args,
  }: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> => {
    const op = classify(toolCall.name, (args ?? {}) as Record<string, unknown>);
    if (!op) {
      return undefined;
    }
    const headline = describe(op);
    if (!ask) {
      return {
        block: true,
        reason:
          `Refused: ${headline} There is no interactive session to approve it. ` +
          "Tell the user what you wanted to do and let them do it in the Galaxy interface.",
      };
    }
    if (!(await ask("Confirm destructive operation", headline))) {
      return { block: true, reason: `Refused: ${headline} The user declined.` };
    }
    return undefined;
  };
}
