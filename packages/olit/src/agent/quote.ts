/** A value in text the model reads, spelled as JSON spells it: what every tool result uses. */
export const quote = (value: unknown): string =>
  value === undefined ? "null" : (JSON.stringify(value) ?? String(value));
