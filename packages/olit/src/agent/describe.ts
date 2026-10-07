import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as galaxyOps from "@galaxyproject/galaxy-ops/browser";
import { allOperations } from "@galaxyproject/galaxy-ops/browser";

import { DEFAULT_COMPACTION_POLICY } from "@earendil-works/pi-durable";

import { MAX_AUTO_FOLLOW_UPS } from "./documents";
import { MAX_STEPS } from "./extension";
import { connect, keyVariable } from "./model";
import { STARTER } from "./notebook";
import { LOOP } from "./runtime";
import { opsTools } from "./ops";
import { defaultEndpoint, PROVIDERS, resolve } from "./providers";
import { GUARDS } from "./tool";
import { olitTools } from "./tools";

const SCHEMA = 1;
const SOURCE = "src/agent";
const SKIPPED = ["skills/"];

/** Whitespace-normalised hash: reflowing a paragraph is not a semantic change. */
export const fingerprint = (text: string) =>
  createHash("sha256")
    .update((text ?? "").split(/\s+/).filter(Boolean).join(" "))
    .digest("hex")
    .slice(0, 16);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The galaxy-ops entry Olit imports, keyed as a module beside Olit's own. */
const GALAXY_OPS = "@galaxyproject/galaxy-ops/browser";

/** Every name a module exports, by module. */
function symbols(root: string): Record<string, string[]> {
  const base = join(root, SOURCE);
  const out: Record<string, string[]> = {};
  for (const file of walk(base).sort()) {
    const rel = relative(base, file);
    if (
      !file.endsWith(".ts") ||
      file.endsWith(".test.ts") ||
      SKIPPED.some((s) => rel.startsWith(s))
    ) {
      continue;
    }
    const names = [
      ...readFileSync(file, "utf8").matchAll(
        /^export (?:async )?(?:const|function|class|interface|type) (\w+)/gm,
      ),
    ];
    if (names.length) {
      out[`${SOURCE}/${rel}`] = [...new Set(names.map((m) => m[1]))].sort();
    }
  }
  // What Olit links against in galaxy-ops, so a seam can name where moved behaviour lives now.
  out[GALAXY_OPS] = Object.keys(galaxyOps).sort();
  return out;
}

function promptBlocks(root: string): string[] {
  const text = readFileSync(join(root, SOURCE, "prompt.ts"), "utf8");
  const blocks = [...text.matchAll(/^export const ([A-Z][A-Z_0-9]{2,}) = `/gm)].map((m) => m[1]);
  const builders = [...text.matchAll(/^export function (\w+Block)\(/gm)].map((m) => m[1]);
  return [...new Set([...blocks, ...builders])].sort();
}

function identityPrompt(root: string) {
  const found = /<ai_prompt>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ai_prompt>/.exec(
    readFileSync(join(root, "public/olit.xml"), "utf8"),
  );
  // The text too: a harness seeds a run with the prompt the page seeds a conversation with.
  return found ? { fingerprint: fingerprint(found[1]), text: found[1].trim() } : {};
}

function typeOf(spec: Record<string, any>): string {
  // zod writes a nullable field with constraints on it as anyOf rather than a type list.
  const kind = Array.isArray(spec.anyOf)
    ? spec.anyOf.map((branch: Record<string, any>) => typeOf(branch)).join("|")
    : Array.isArray(spec.type)
      ? spec.type.join("|")
      : spec.type || "any";
  const enumerated = spec.enum ? `(${spec.enum.join("|")})` : "";
  const fallback = "default" in spec ? `=${spec.default}` : "";
  return kind + enumerated + fallback;
}

function tools() {
  const delegated = new Set(opsTools().map((t) => t.name));
  // The result shape galaxy-ops declares for each operation and reads back in its own tests.
  const declared = new Map(allOperations.map((op) => [op.name, op.result ?? null]));
  const out: Record<string, unknown> = {};
  for (const tool of olitTools()) {
    const params = tool.parameters as { properties?: Record<string, any>; required?: string[] };
    const properties = params.properties ?? {};
    const required = new Set(params.required ?? []);
    const names = Object.keys(properties).sort();
    out[tool.name] = {
      capability: tool.capability ?? null,
      runner: delegated.has(tool.name) ? "galaxy-ops" : "olit",
      signature: fingerprint(`${tool.description}|${names.join(",")}`),
      params: Object.fromEntries(
        names.map((n) => [n, typeOf(properties[n]) + (required.has(n) ? "!" : "")]),
      ),
      prose: fingerprint(
        [tool.description, ...names.map((n) => `${n}:${properties[n].description ?? ""}`)].join(
          "\n",
        ),
      ),
      result: declared.get(tool.name) ?? null,
    };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** What an unconfigured request carries, with and without tools, read off the real request. */
async function llmRequest() {
  const { models, model } = await connect(resolve({ ai_base_url: "http://x/v1", ai_model: "m" }));
  const capture = async (tools: unknown[]) => {
    let body: Record<string, unknown> = {};
    const stream = models.streamSimple(
      models.getModel(model.provider as never, model.modelId)!,
      { messages: [{ role: "user", content: "hi", timestamp: 0 }], tools } as never,
      {
        fetch: async () =>
          new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
        onPayload: (payload: unknown) => {
          body = payload as Record<string, unknown>;
        },
      } as never,
    );
    await stream.result();
    return body;
  };
  const bare = await capture([]);
  const withTools = await capture([
    { name: "finish", description: "", parameters: { type: "object" } },
  ]);
  return {
    body_keys: Object.keys(bare)
      .filter((k) => k !== "messages")
      .sort(),
    sampling: Object.fromEntries(
      ["max_tokens", "temperature", "tool_choice", "top_p"].map((k) => [k, bare[k] ?? null]),
    ),
    with_tools: { tool_choice: withTools.tool_choice ?? null },
  };
}

function loop() {
  return {
    keep_recent_tokens: DEFAULT_COMPACTION_POLICY.keepRecentTokens,
    max_steps: MAX_STEPS,
    reserve_tokens: DEFAULT_COMPACTION_POLICY.reserveTokens,
    tool_execution: LOOP.toolExecution,
  };
}

/** The follow-up contract every driver shares: the runtime delivers them, up to a cap. */
function followUps() {
  return { max_auto_follow_ups: MAX_AUTO_FOLLOW_UPS, settled_by: "runtime" };
}

function skills(root: string) {
  const base = join(root, SOURCE, "skills/galaxy-skills");
  const files = existsSync(base)
    ? Object.fromEntries(
        walk(base)
          .filter((f) => f.endsWith(".md"))
          .sort()
          .map((f) => [
            relative(base, f),
            createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16),
          ]),
      )
    : {};
  const lock = JSON.parse(readFileSync(join(root, "skills.lock.json"), "utf8"));
  return {
    vendored: Object.keys(files).length > 0,
    files,
    repo: lock.repo,
    ref: lock.ref,
    sha: lock.sha,
  };
}

/** Where each named provider's requests go and which variable holds its key, for a harness
 * that records completions or supplies credentials without resolving them a second way. */
async function providers() {
  return Object.fromEntries(
    await Promise.all(
      PROVIDERS.map(async (p) => [
        p.id,
        { base_url: (await defaultEndpoint(p)) ?? null, auth_env: (await keyVariable(p)) ?? null },
      ]),
    ),
  );
}

/** The surface Olit exposes, as data, for an evaluator that does not read its source. */
export async function describe(root: string) {
  return {
    schema: SCHEMA,
    agent: "olit",
    identity_prompt: identityPrompt(root),
    symbols: symbols(root),
    prompt_blocks: promptBlocks(root),
    tools: tools(),
    policy: { llm_request: await llmRequest(), loop: loop(), guards: [...GUARDS] },
    providers: await providers(),
    follow_ups: followUps(),
    skills: skills(root),
    record: { starter: STARTER, resume_tool: "notebook_resume" },
  };
}
