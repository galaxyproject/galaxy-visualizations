import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { describe as describeOlit } from "./describe";
import { PROVIDERS } from "./providers";
import { olitTools } from "./session";
import { GUARDS } from "./tool";

const ROOT = process.cwd();
type Description = Awaited<ReturnType<typeof describeOlit>>;
let doc: Description;

beforeAll(async () => {
  doc = await describeOlit(ROOT);
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "skills" ? [] : sources(path);
    }
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("the description Olit publishes about itself", () => {
  it("is JSON and names its schema", () => {
    expect(doc.schema).toBe(1);
    expect(doc.agent).toBe("olit");
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it("describes every tool the model is shown", () => {
    expect(Object.keys(doc.tools).sort()).toEqual(
      olitTools()
        .map((t) => t.name)
        .sort(),
    );
  });

  it("gives each tool its contract", () => {
    const tool = doc.tools.get_job_details as Record<string, unknown>;
    expect(tool.capability).toBe("read");
    expect(Object.keys(tool).sort()).toEqual(
      [
        "capability",
        "runner",
        "signature",
        "params",
        "prose",
        "query",
        "passthrough",
        "promised_fields",
      ].sort(),
    );
  });

  it("says which tools galaxy-ops runs and which Olit kept", () => {
    const tools = doc.tools as Record<string, { runner: string; passthrough: boolean }>;
    expect(tools.get_histories.runner).toBe("galaxy-ops");
    expect(tools.get_history_contents.runner).toBe("olit");
    expect(Object.values(tools).filter((t) => t.passthrough)).toEqual([]);
  });

  it("names prompt blocks the prompt module defines", () => {
    expect(doc.prompt_blocks.length).toBeGreaterThan(0);
    const defined = new Set(doc.symbols["src/agent/prompt.ts"]);
    expect(doc.prompt_blocks.filter((b) => !defined.has(b))).toEqual([]);
  });

  it("covers the agent's modules and skips the vendored skills", () => {
    expect(doc.symbols).toHaveProperty(["src/agent/session.ts"]);
    expect(doc.symbols).toHaveProperty(["src/agent/galaxy-tools.ts"]);
    expect(Object.keys(doc.symbols).filter((m) => m.includes("/skills/"))).toEqual([]);
  });

  it("reports the loop bounds and the guards that refuse", () => {
    expect(doc.policy.loop.max_steps).toBeGreaterThan(0);
    expect(doc.policy.loop.max_tool_result_bytes).toBeGreaterThan(0);
    expect(doc.policy.guards).toEqual([...new Set(doc.policy.guards)].sort());
    expect(doc.policy.llm_request.sampling).toHaveProperty("max_tokens");
  });

  it("reads the request off the real request, so leaving tool_choice to the provider shows", () => {
    expect(doc.policy.llm_request.body_keys).toContain("model");
    expect(doc.policy.llm_request.body_keys).not.toContain("messages");
    expect(doc.policy.llm_request.with_tools).toEqual({ tool_choice: null });
  });

  it("reads the identity prompt from the plugin manifest", () => {
    expect(doc.identity_prompt.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it("publishes every provider's endpoint and key variable", () => {
    expect(Object.keys(doc.providers)).toEqual(PROVIDERS.map((p) => p.id));
    expect(doc.providers.jetstream2).toEqual({
      base_url: "https://llm.jetstream-cloud.org/api",
      auth_env: "JETSTREAM2_KEY",
    });
  });

  it("publishes the shell contract a harness stands in for", () => {
    expect(doc.shell).toEqual({ max_auto_follow_ups: 3, resume_prompt_from: "contract/shell.mjs" });
  });

  it("gives the same answer twice", async () => {
    expect(await describeOlit(ROOT)).toEqual(doc);
  });
});

describe("the guard inventory", () => {
  // The Guard type is derived from GUARDS, so the compiler already refuses a guard the policy
  // does not publish. The reverse needs a look at the source.
  it("publishes no guard the code never sets", () => {
    const code = sources(join(ROOT, "src/agent"))
      .filter((path) => !path.endsWith("/tool.ts"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(GUARDS.filter((g) => !code.includes(`"${g}"`))).toEqual([]);
  });

  it("includes the guard observed refusing live", () => {
    expect(GUARDS).toContain("malformed-object-id");
  });
});

describe("the shell contract", () => {
  const COMPLETED = [{ kind: "job", id: "j1", label: "Galaxy job j1", outcome: "completed" }];
  const FAILED = [
    { kind: "invocation", id: "i1", label: "Workflow invocation i1", outcome: "failed" },
  ];
  const ask = (runs?: unknown[]) =>
    JSON.parse(
      execFileSync("node", ["--experimental-strip-types", join(ROOT, "contract/shell.mjs")], {
        input: runs ? JSON.stringify(runs) : "",
        encoding: "utf8",
        stdio: "pipe",
      }),
    );

  it("names a settled run in the message it builds", () => {
    const prompt = ask(COMPLETED).resume_prompt;
    expect(prompt.startsWith("[Olit automatic Galaxy follow-up]")).toBe(true);
    expect(prompt).toContain('"id": "j1"');
  });

  it("warns about a failed run and not about a completed one", () => {
    expect(ask(FAILED).resume_prompt).toContain("still have jobs running");
    expect(ask(COMPLETED).resume_prompt).not.toContain("still have jobs running");
  });
});
