import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_REPO,
  parseFrontmatter,
  selectSkills,
  SkillRegistry,
  skillRegistry,
  skillsTool,
  SURFACE_ID,
  type SkillEntry,
} from "./skills";
import { Outcome, type Context } from "./tool";
import { olitTools } from "./tools";

const SKILL = `---
name: galaxy-transform-collection
description: Transform Galaxy dataset collections reproducibly.
when_to_use: the user asks to filter, sort, relabel, or restructure a collection
metadata:
  surfaces: [loom]
---

# Collections

Use Galaxy's native tools; never build collections ad hoc.
`;

const corpus = (files: Record<string, string>) =>
  new SkillRegistry().register("galaxy-skills", files);

const ctx = {} as Context;

async function fetchSkill(registry: SkillRegistry, args: Record<string, unknown>) {
  const value = await skillsTool(registry).run(args, ctx);
  return value instanceof Outcome ? value : new Outcome(value as string);
}

const entry = (path: string, surfaces: string[] = []): SkillEntry => ({
  path,
  name: path,
  description: "",
  whenToUse: "",
  surfaces,
});

describe("frontmatter, exactly Orbit's keys", () => {
  it("reads surfaces from metadata, not the top level", () => {
    const meta = parseFrontmatter(SKILL);
    expect(meta.name).toBe("galaxy-transform-collection");
    expect(meta.description?.startsWith("Transform Galaxy")).toBe(true);
    expect(meta.when_to_use?.startsWith("the user asks")).toBe(true);
    expect(meta.surfaces).toEqual(["loom"]);
    expect(parseFrontmatter("---\nname: x\nsurfaces: [loom]\n---\n\nbody").surfaces).toEqual([]);
  });

  it("yields no metadata for unparseable frontmatter", () => {
    expect(parseFrontmatter("---\nname: x\nargument-hint: [a] [b]\n---\n\nbody")).toEqual({});
    expect(parseFrontmatter("no frontmatter at all")).toEqual({});
  });
});

describe("tag-or-all selection", () => {
  it("keeps tagged entries, and every entry when none is tagged", () => {
    const tagged = entry("a/SKILL.md", [SURFACE_ID]);
    const untagged = entry("b/SKILL.md");
    expect(selectSkills([tagged, untagged])).toEqual([tagged]);
    expect(selectSkills([untagged])).toEqual([untagged]);
  });

  it("uses Orbit's surface tag", () => {
    expect(SURFACE_ID).toBe("loom");
  });
});

describe("the router", () => {
  it("lists the fetch call and never a body", () => {
    const router = corpus({ "collection-manipulation/SKILL.md": SKILL }).routerText();
    expect(router).toContain("## Skills repositories (operational know-how)");
    expect(router).toContain('skills_fetch({ path: "collection-manipulation/SKILL.md" })');
    expect(router).toContain("When to use: the user asks");
    expect(router).toContain("Read the SKILL.md fully before acting on what it teaches.");
    expect(router).not.toContain("never build collections ad hoc");
  });

  it("costs the same whatever a skill weighs", () => {
    const small = corpus({ "a/SKILL.md": SKILL }).routerText();
    const big = corpus({ "a/SKILL.md": SKILL + "\nfiller.\n".repeat(2000) }).routerText();
    expect(small).toBe(big);
  });

  it("has no section without repos", () => {
    expect(new SkillRegistry().routerText()).toBe("");
  });
});

describe("skills_fetch", () => {
  it("is addressed by path, not by name", () => {
    const params = skillsTool(corpus({ "a/SKILL.md": SKILL })).parameters as any;
    expect(params.required).toEqual(["path"]);
    expect(params.properties.repo.enum).toEqual(["galaxy-skills"]);
  });

  it("returns a reference file beside the skill", async () => {
    const registry = corpus({
      "a/SKILL.md": SKILL,
      "a/references/gotchas.md": "id vs name is the classic trap",
    });
    expect((await fetchSkill(registry, { path: "a/references/gotchas.md" })).text).toContain(
      "classic trap",
    );
  });

  it("reports a missing path as an error", async () => {
    const out = await fetchSkill(corpus({ "a/SKILL.md": SKILL }), { path: "a/nope.md" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Error");
    expect(out.text).toContain("nope.md");
  });

  it("refuses traversal out of the corpus", async () => {
    const registry = new SkillRegistry()
      .register("galaxy-skills", { "a/SKILL.md": SKILL })
      .register("other", { "secret.md": "not part of the corpus" });
    const out = await fetchSkill(registry, { path: "../other/secret.md" });
    expect(out.text).toContain("Error");
    expect(out.text).not.toContain("not part of the corpus");
  });

  it("does not truncate", async () => {
    const body = "---\nname: long\nmetadata:\n  surfaces: [loom]\n---\n\n" + "step. ".repeat(2000);
    const out = await fetchSkill(corpus({ "a/SKILL.md": body }), { path: "a/SKILL.md" });
    expect(out.text.length).toBeGreaterThan(10000);
    expect(out.text).not.toContain("truncated");
  });

  it("names an unknown repo and the available ones", async () => {
    const out = await fetchSkill(corpus({ "a/SKILL.md": SKILL }), {
      repo: "nope",
      path: "a/SKILL.md",
    });
    expect(out.isError).toBe(true);
    expect(out.text).toBe('Error: Skills repo "nope" is not configured. Available: galaxy-skills.');
  });

  it("points a path no repo holds at the router", async () => {
    const out = await fetchSkill(corpus({ "a/SKILL.md": SKILL }), { path: "nowhere/SKILL.md" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("skills router");
  });
});

describe("the shipped corpus", async () => {
  const stamp = (await import("./skills/galaxy-skills/VENDORED.json")).default;
  const registry = skillRegistry();

  it("loads and is pinned", () => {
    expect(stamp.repo).toBe("galaxyproject/galaxy-skills");
    expect(stamp.sha).toHaveLength(40);
    expect(registry.names()).toContain("galaxy-skills");
    const repo = registry.find("galaxy-skills")!;
    expect(repo.catalog()).toHaveLength(stamp.skills);
    expect(selectSkills(repo.catalog()).length).toBeGreaterThan(0);
  });

  it("makes olit's own skills the default repo", () => {
    expect(registry.names()[0]).toBe(DEFAULT_REPO);
    expect(registry.find()?.name).toBe("olit-skills");
  });

  it("reaches a real skill body by its router path", () => {
    const first = selectSkills(registry.find("galaxy-skills")!.catalog())[0];
    expect(registry.read("galaxy-skills", first.path)?.length).toBeGreaterThan(200);
  });

  it("offers an example path the default repo answers", () => {
    const described = (skillsTool(registry).parameters as any).properties.path
      .description as string;
    const quoted = described.split("'")[1];
    expect(registry.read(undefined, quoted)).toBeTruthy();
  });

  it("names the repo holding a path from another repo", async () => {
    const out = await fetchSkill(registry, { path: "collection-manipulation/SKILL.md" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("galaxy-skills");
    expect(registry.read("galaxy-skills", "collection-manipulation/SKILL.md")).toBeTruthy();
  });
});

describe("Olit's own skills", () => {
  it("call each tool only with arguments the tool takes", () => {
    const root = join(__dirname, "skills", "olit-skills");
    const params = new Map(
      olitTools().map((t) => [t.name, Object.keys(t.parameters.properties ?? {})]),
    );
    const wrong: string[] = [];
    for (const skill of readdirSync(root)) {
      const text = readFileSync(join(root, skill, "SKILL.md"), "utf8");
      for (const [, name, args] of text.matchAll(/`([a-z_]+)\(([^`)]*)\)`/g)) {
        const known = params.get(name);
        if (!known) continue;
        for (const arg of args
          .split(",")
          .map((a) => a.split("=")[0].trim())
          .filter(Boolean)) {
          if (!known.includes(arg)) wrong.push(`${skill}: ${name}(${arg})`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
