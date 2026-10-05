const REGISTRY = "quay.io/biocontainers";
const tagsUrl = (name: string) =>
  `https://quay.io/api/v1/repository/biocontainers/${encodeURIComponent(name)}/tag/?onlyActiveTags=true&limit=100`;

export type MatchQuality = "exact_version" | "name_only" | "not_found";

export interface Tag {
  name?: string;
  start_ts?: number;
}

export interface Recommendation {
  image: string | null;
  found: boolean;
  match_quality: MatchQuality;
  source: string;
  notes: string[];
  verified: boolean | null;
}

/** Upstream's `name` or `name=version`, validated before anything reaches the network. */
export function parsePackages(packages: unknown[] | undefined): [string, string | null][] {
  const parsed = (packages ?? []).map((pkg): [string, string | null] => {
    const text = String(pkg);
    const cut = text.indexOf("=");
    const name = (cut < 0 ? text : text.slice(0, cut)).trim();
    if (!name) {
      throw new Error(`invalid package entry '${text}': expected 'name' or 'name=version'`);
    }
    return [name, cut < 0 ? null : text.slice(cut + 1).trim() || null];
  });
  if (!parsed.length) {
    throw new Error("packages must contain at least one conda package name");
  }
  return parsed;
}

/** galaxy-mcp's response shape, so the agent reads the same fields from either server. */
function result({
  image = null,
  found = false,
  match_quality = "not_found",
  notes = [],
  verified = null,
}: Partial<Recommendation> = {}): Recommendation {
  return { image, found, match_quality, source: "quay.io tag listing", notes, verified };
}

const VERSION_PART = /^(\d+(?:\.\d+)*)/;

/** Order by the version in the tag, then by build time within one version. */
function compareTags(a: Tag, b: Tag): number {
  const numbers = (tag: Tag) =>
    VERSION_PART.exec(tag.name ?? "")?.[1]
      .split(".")
      .map(Number) ?? [];
  const [x, y] = [numbers(a), numbers(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) {
      return x[i] - y[i];
    }
  }
  return x.length - y.length || (a.start_ts || 0) - (b.start_ts || 0);
}

const newest = (tags: Tag[]) =>
  tags.reduce((best, tag) => (compareTags(tag, best) > 0 ? tag : best)).name!;

/** The tag to use, and whether it matches the pinned version. */
export function pickTag(tags: unknown[], version: string | null): [string | null, MatchQuality] {
  const named = tags.filter((t): t is Tag => !!t && typeof t === "object" && !!(t as Tag).name);
  if (!named.length) {
    return [null, "not_found"];
  }
  if (version) {
    const exact = named.filter((t) => t.name === version || t.name!.startsWith(`${version}--`));
    if (exact.length) {
      return [newest(exact), "exact_version"];
    }
  }
  return [newest(named), "name_only"];
}

/** One package resolves against the registry; several need mulled, which is not here. */
export async function recommend(
  packages: unknown[] | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Recommendation> {
  const parsed = parsePackages(packages);
  if (parsed.length > 1) {
    const names = parsed.map(([name]) => name).join(", ");
    return result({
      notes: [
        `A single image for several packages (${names}) is a mulled-v2 hash over the ` +
          "package set, which a tag listing cannot reveal. Ask Galaxy's own MCP server, " +
          "or install the packages in one tool one at a time.",
      ],
    });
  }
  const [[name, version]] = parsed;
  let body: string;
  try {
    const response = await fetchImpl(tagsUrl(name));
    body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body}`);
    }
  } catch (e) {
    return result({
      notes: [
        `quay.io did not answer for '${name}' (${(e as Error).message}); no image was resolved.`,
      ],
    });
  }
  const tags = (JSON.parse(body) as { tags?: unknown[] } | null)?.tags ?? [];
  const [tag, quality] = pickTag(tags, version);
  if (tag === null) {
    return result({ notes: [`quay.io lists no active tags for '${name}'.`] });
  }
  const notes: string[] = [];
  if (quality === "name_only") {
    notes.push(
      version
        ? `No built tag matches version '${version}'; using the newest instead.`
        : "No version was pinned; using the newest built tag.",
    );
  }
  return result({
    image: `${REGISTRY}/${name}:${tag}`,
    found: true,
    match_quality: quality,
    notes,
    verified: true,
  });
}
