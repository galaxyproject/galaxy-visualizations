import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { describe as describeOlit } from "./describe";
import { PROVIDERS } from "./providers";
import { olitTools } from "./tools";
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
      ["capability", "runner", "signature", "params", "prose", "result"].sort(),
    );
  });

  it("says which tools galaxy-ops runs and which Olit kept", () => {
    const tools = doc.tools as Record<string, { runner: string }>;
    expect(tools.get_histories.runner).toBe("galaxy-ops");
    expect(tools.get_history_contents.runner).toBe("galaxy-ops");
    expect(tools.download_dataset.runner).toBe("olit");
  });

  it("names prompt blocks the prompt module defines", () => {
    expect(doc.prompt_blocks.length).toBeGreaterThan(0);
    const defined = new Set(doc.symbols["src/agent/prompt.ts"]);
    expect(doc.prompt_blocks.filter((b) => !defined.has(b))).toEqual([]);
  });

  it("covers the agent's modules and skips the vendored skills", () => {
    expect(doc.symbols).toHaveProperty(["src/agent/runtime.ts"]);
    expect(doc.symbols).toHaveProperty(["src/agent/galaxy-tools.ts"]);
    expect(Object.keys(doc.symbols).filter((m) => m.includes("/skills/"))).toEqual([]);
  });

  it("reports the loop bounds and the guards that refuse", () => {
    expect(doc.policy.loop.max_steps).toBeGreaterThan(0);
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
    expect(doc.identity_prompt.text).toContain("You both talk and act.");
  });

  it("publishes every provider's endpoint and key variable", () => {
    expect(Object.keys(doc.providers)).toEqual(PROVIDERS.map((p) => p.id));
    expect(doc.providers.jetstream2).toEqual({
      base_url: "https://llm.jetstream-cloud.org/api",
      auth_env: "JETSTREAM2_KEY",
    });
  });

  it("publishes the follow-up contract every driver shares", () => {
    expect(doc.follow_ups).toEqual({ max_auto_follow_ups: 3, settled_by: "runtime" });
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
