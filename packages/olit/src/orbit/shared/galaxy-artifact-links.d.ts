export type GalaxyArtifactKind =
  | "server"
  | "history"
  | "dataset"
  | "collection"
  | "job"
  | "invocation"
  | "workflow"
  | "page"
  | "revision"
  | "tool";
export interface GalaxyArtifactReference {
  start: number;
  end: number;
  href: string;
  kind: GalaxyArtifactKind;
}
export function normalizeGalaxyLinkServer(serverUrl: unknown): string | null;
export function galaxyArtifactUrl(
  serverUrl: unknown,
  kind: GalaxyArtifactKind,
  id?: string | null,
  options?: { pageId?: string },
): string | null;
export function galaxyLinkServerInText(text: string): string | null;
export function galaxyArtifactReferences(
  text: string,
  fallbackServer?: string | null,
  options?: { trustTextServer?: boolean },
): GalaxyArtifactReference[];
