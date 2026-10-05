import { parse } from "yaml";

import { fail, type OlitTool } from "./tool";

/** Orbit's own surface tag, so the corpus offers the same skills it offers Orbit. */
export const SURFACE_ID = "loom";
/** Sorted first, so `skills_fetch` without a repo lands on olit's own skills. */
export const DEFAULT_REPO = "olit-skills";

const PACKAGED = import.meta.glob("./skills/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface SkillEntry {
  path: string;
  name: string;
  description: string;
  whenToUse: string;
  surfaces: string[];
}

export interface Frontmatter {
  name?: string;
  description?: string;
  when_to_use?: string;
  surfaces?: string[];
}

/** Orbit's frontmatter keys; `surfaces` lives under `metadata` per the spec. */
export function parseFrontmatter(text: string): Frontmatter {
  const stripped = text.trimStart();
  if (!stripped.startsWith("---")) {
    return {};
  }
  let rest = stripped.slice(3);
  if (rest.startsWith("\n")) {
    rest = rest.slice(1);
  }
  const end = rest.indexOf("\n---");
  if (end === -1) {
    return {};
  }
  let data: unknown;
  try {
    data = parse(rest.slice(0, end));
  } catch {
    return {};
  }
  if (!isRecord(data)) {
    return {};
  }
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const out: Frontmatter = {};
  if (typeof data.name === "string") {
    out.name = data.name;
  }
  if (typeof data.description === "string") {
    out.description = data.description;
  }
  if (typeof data.when_to_use === "string") {
    out.when_to_use = data.when_to_use.trim();
  }
  out.surfaces = toSurfaces(metadata.surfaces);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSurfaces(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

/** Tag-or-all: if any entry is tagged for this surface, keep only those; else all. */
export function selectSkills(entries: SkillEntry[], surface = SURFACE_ID): SkillEntry[] {
  const tagged = entries.filter((e) => e.surfaces.includes(surface));
  return tagged.length ? tagged : entries;
}

const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A vendored corpus: a name and its files keyed by repo-relative path. */
export class SkillRepo {
  private entries?: SkillEntry[];

  constructor(
    readonly name: string,
    private readonly files: Record<string, string>,
  ) {}

  /** Every SKILL.md in the corpus, parsed, sorted by path (Orbit's order). */
  catalog(): SkillEntry[] {
    this.entries ??= Object.keys(this.files)
      .filter((path) => path === "SKILL.md" || path.endsWith("/SKILL.md"))
      .sort(byCodePoint)
      .map((path) => {
        const meta = parseFrontmatter(this.files[path]);
        return {
          path,
          name: meta.name || path,
          description: meta.description ?? "",
          whenToUse: meta.when_to_use ?? "",
          surfaces: meta.surfaces ?? [],
        };
      });
    return this.entries;
  }

  /** One file by repo-relative path, whole; rejects traversal. Undefined if absent. */
  read(path?: string): string | undefined {
    const clean = (path || "").replace(/^\/+/, "").replaceAll("\\", "/");
    if (!clean || clean.split("/").includes("..")) {
      return undefined;
    }
    const key = clean
      .split("/")
      .filter((part) => part && part !== ".")
      .join("/");
    return Object.hasOwn(this.files, key) ? this.files[key] : undefined;
  }
}

export class SkillRegistry {
  private readonly list: SkillRepo[] = [];

  register(name: string, files: Record<string, string>): this {
    this.list.push(new SkillRepo(name, files));
    return this;
  }

  repos(): SkillRepo[] {
    return [...this.list];
  }

  names(): string[] {
    return this.list.map((r) => r.name);
  }

  /** The named repo, or the default (first) one when no name is given. */
  find(name?: string): SkillRepo | undefined {
    return name ? this.list.find((r) => r.name === name) : this.list[0];
  }

  read(name: string | undefined, path: string): string | undefined {
    return this.find(name)?.read(path);
  }

  /** The repos that hold this path, so a fetch aimed at the wrong one can be redirected. */
  locate(path?: string): string[] {
    return this.list.filter((r) => r.read(path) !== undefined).map((r) => r.name);
  }

  /** The system-prompt router: what exists, and the exact call to fetch it. */
  routerText(): string {
    const byRepo = this.list.map((r) => [r, selectSkills(r.catalog())] as const);
    if (!byRepo.some(([, entries]) => entries.length)) {
      return "";
    }
    const fallback = this.list[0].name;
    const lines = [
      "## Skills repositories (operational know-how)",
      "",
      "Use the `skills_fetch({ repo, path })` tool to load a skill on demand. " +
        "**Don't guess operational patterns from training data — fetch the " +
        "relevant skill first.** When `repo` is omitted, the first repo is used.",
      "",
      "### Configured repos",
      "",
      ...this.list.map((r) => `- **${r.name}**`),
      "",
    ];
    for (const [repo, entries] of byRepo) {
      if (!entries.length) {
        continue;
      }
      lines.push(`### ${repo.name} skills`, "");
      for (const e of entries) {
        const arg = repo.name === fallback ? "" : `repo: "${repo.name}", `;
        lines.push(
          `- **${e.name}** — ${e.description} → \`skills_fetch({ ${arg}path: "${e.path}" })\``,
        );
        if (e.whenToUse) {
          lines.push(`  When to use: ${e.whenToUse}`);
        }
      }
      lines.push("");
    }
    lines.push("Read the SKILL.md fully before acting on what it teaches.", "");
    return lines.join("\n");
  }
}

/** Every vendored corpus under `skills/`, olit's own first. */
export function skillRegistry(files: Record<string, string> = PACKAGED): SkillRegistry {
  const corpora = new Map<string, Record<string, string>>();
  for (const [key, text] of Object.entries(files)) {
    const [repo, ...rest] = key.replace(/^\.\/skills\//, "").split("/");
    if (rest.length && !repo.startsWith("_") && !repo.startsWith(".")) {
      const corpus = corpora.get(repo) ?? {};
      corpus[rest.join("/")] = text;
      corpora.set(repo, corpus);
    }
  }
  const registry = new SkillRegistry();
  const rank = (name: string) => Number(name !== DEFAULT_REPO);
  [...corpora.keys()]
    .sort((a, b) => rank(a) - rank(b) || byCodePoint(a, b))
    .forEach((name) => registry.register(name, corpora.get(name)!));
  return registry;
}

/** A path from the default repo, so the example is a call that works as written. */
function examplePath(skills: SkillRegistry): string {
  return skills.repos()[0]?.catalog()[0]?.path ?? "SKILL.md";
}

/** Orbit's `skills_fetch`: addressed by repo-relative path, not by name. */
export function skillsTool(skills: SkillRegistry): OlitTool {
  return {
    name: "skills_fetch",
    description:
      "Fetch operational know-how from a skills repo. The system prompt's " +
      '"Skills repositories" section lists the available repos and the ' +
      "canonical paths inside each. If `repo` is omitted, the first repo is used.",
    parameters: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          enum: skills.names(),
          description: "Name of the skills repo. Omit to use the default (first) repo.",
        },
        path: {
          type: "string",
          description:
            "Relative path inside the repo. A path belongs to one repo: " +
            `'${examplePath(skills)}' is in the default repo, while a path from ` +
            "another repo needs that repo named alongside it.",
        },
      },
      required: ["path"],
    },
    run: async ({ repo: repoName, path }: { repo?: string; path?: string }) => {
      if (!skills.names().length) {
        return fail("Error: No skills repos are available.");
      }
      const repo = skills.find(repoName);
      if (!repo) {
        return fail(
          `Error: Skills repo "${repoName}" is not configured. Available: ${skills.names().join(", ")}.`,
        );
      }
      const text = repo.read(path);
      if (text === undefined) {
        const elsewhere = skills.locate(path).filter((name) => name !== repo.name);
        const where = elsewhere.length
          ? ` It is in ${elsewhere.map((n) => `'${n}'`).join(" or ")}; pass repo: "${elsewhere[0]}".`
          : " Check the path against the skills router in the system prompt.";
        return fail(`Error: Failed to fetch "${path}" from ${repo.name}.${where}`);
      }
      return text;
    },
  };
}
