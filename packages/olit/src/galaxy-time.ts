/** A Galaxy timestamp, which is UTC though it carries no zone, as Galaxy's client reads it. */
export function galaxyDate(value: string): Date {
  return new Date(value.endsWith("Z") ? value : `${value}Z`);
}

/** A Galaxy timestamp in the viewer's own time, or as given when it does not parse. */
export function localTime(value: string): string {
  const date = galaxyDate(value);
  return isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
