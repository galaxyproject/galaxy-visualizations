import { describe, expect, it } from "vitest";

import { buildConfig } from "./config";

const incoming = (specs: Record<string, unknown>) => ({
  root: "/",
  datasetId: "d1",
  historyId: "h1",
  specs,
  settings: {},
});

describe("buildConfig", () => {
  it("never hands the brain the API key", () => {
    const config = buildConfig(incoming({}), { provider: "openrouter", apiKey: "sk-secret" });
    expect(JSON.stringify(config)).not.toContain("sk-secret");
    expect("ai_api_key" in config).toBe(false);
  });

  it("carries no Galaxy key: the browser authenticates with the user's session", () => {
    expect("galaxy_key" in buildConfig(incoming({ galaxy_api_key: "fea4130124bb18ef" }))).toBe(
      false,
    );
  });

  it("carries no capability grant: an install cannot half-disable the agent", () => {
    expect("capabilities" in buildConfig(incoming({ capabilities: "llm,local,read" }))).toBe(false);
  });
});
