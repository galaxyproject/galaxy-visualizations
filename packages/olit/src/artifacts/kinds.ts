/**
 * The artifacts Olit makes, one entry per kind: what each carries, and how it is written into a
 * Galaxy page. How each draws in the pane is `PANE` in ./index; both are keyed by this union.
 */
import type { EntryRecord, JsonObject } from "@earendil-works/pi-durable";

export type Artifact =
  | { kind: "vega-lite"; title: string; spec: JsonObject }
  | { kind: "mermaid"; title: string; diagram: string }
  | {
      kind: "visualization";
      title: string;
      /** The plugin, and the dataset it shows. */
      visualization: string;
      dataset_id: string;
      settings?: JsonObject;
      tracks?: JsonObject[];
      /** A saved copy in Galaxy, when there is one; the config above stays canonical. */
      visualization_id?: string;
    };

export type Kind = Artifact["kind"];
export type ArtifactOf<K extends Kind> = Extract<Artifact, { kind: K }>;

const fenced = (label: string, body: string) => "```" + label + "\n" + body + "\n```";

/** Each kind as Galaxy page markdown, or null for a kind Galaxy pages cannot render. */
export const PAGE: { [K in Kind]: ((artifact: ArtifactOf<K>) => string) | null } = {
  "vega-lite": (a) => fenced("vega", JSON.stringify(a.spec, null, 2)),
  // Galaxy renders no mermaid cell; it shows one as an error, and its server refuses the page.
  mermaid: null,
  // A page holds a visualization's config, not a reference to a saved one.
  visualization: (a) =>
    fenced(
      "visualization",
      JSON.stringify(
        {
          visualization_name: a.visualization,
          visualization_title: a.title,
          dataset_id: a.dataset_id,
          ...(a.settings ? { settings: a.settings } : {}),
          ...(a.tracks ? { tracks: a.tracks } : {}),
        },
        null,
        2,
      ),
    ),
};

export const isKind = (kind: unknown): kind is Kind =>
  typeof kind === "string" && Object.hasOwn(PAGE, kind);

/** `artifact` as page markdown, or undefined when Galaxy pages cannot render its kind. */
export function toPage(artifact: Artifact): string | undefined {
  return (PAGE[artifact.kind] as ((a: Artifact) => string) | null)?.(artifact);
}

/** The artifacts results carried in their details, newest last. */
export function artifactsOf(entries: readonly EntryRecord[]): Artifact[] {
  return entries.flatMap((entry) => {
    const message = entry.model?.[0] as
      { role?: string; details?: { artifacts?: Artifact[] } } | undefined;
    const carried = message?.role === "toolResult" ? (message.details?.artifacts ?? []) : [];
    return carried.filter((a) => isKind(a?.kind));
  });
}
