export type Ask = (title: string, message: string) => Promise<boolean>;

/**
 * What a call would destroy, in words for the person approving it, or undefined when it
 * destroys nothing. Whether it destroys is the tool's to say (galaxy-ops' `destructive` and
 * `destructiveWhen`); the words are Olit's, and a whole history gets its own, as loom gives it.
 */
export function classify(
  name: string,
  args: Record<string, unknown>,
  destroys: (name: string, args: Record<string, unknown>) => boolean = () => false,
): string | undefined {
  if (!destroys(name, args)) {
    return undefined;
  }
  if (name === "update_history") {
    const suffix = typeof args.history_id === "string" ? ` (${args.history_id})` : "";
    return (
      `Mark the entire history${suffix} as deleted — not just specific datasets. ` +
      "Recoverable via Undelete on most Galaxy servers, but it affects the whole history."
    );
  }
  return `Run ${name} with ${JSON.stringify(args)}, which deletes or cancels and cannot be undone.`;
}

/** Asks when someone can answer, refuses when nobody can; never cached. Returns the refusal. */
export function destructiveGate(
  ask?: Ask,
  destroys: (name: string, args: Record<string, unknown>) => boolean = () => false,
) {
  return async (name: string, args: Record<string, unknown>): Promise<string | undefined> => {
    const headline = classify(name, args, destroys);
    if (!headline) {
      return undefined;
    }
    if (!ask) {
      return (
        `Refused: ${headline} There is no interactive session to approve it. ` +
        "Tell the user what you wanted to do and let them do it in the Galaxy interface."
      );
    }
    if (!(await ask("Confirm destructive operation", headline).catch(() => false))) {
      return `Refused: ${headline} The user declined.`;
    }
    return undefined;
  };
}
