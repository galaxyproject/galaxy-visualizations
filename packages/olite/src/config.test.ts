import { describe, expect, it } from "vitest";

import { buildConfig } from "./config";

const incoming = (specs: Record<string, unknown>) => ({
    root: "/", datasetId: "d1", historyId: "h1", specs, settings: {},
});

describe("buildConfig", () => {
    it("never hands the brain the API key", () => {
        const config = buildConfig(incoming({}), { provider: "openrouter", apiKey: "sk-secret" });
        expect(JSON.stringify(config)).not.toContain("sk-secret");
        expect("ai_api_key" in config).toBe(false);
    });

    it("grants what the manifest declares", () => {
        expect(buildConfig(incoming({ capabilities: "llm, local,read" })).capabilities).toEqual(["llm", "local", "read"]);
    });

    it("leaves the grant to the brain's default when the manifest is silent", () => {
        expect(buildConfig(incoming({})).capabilities).toBeUndefined();
        expect(buildConfig(incoming({ capabilities: "" })).capabilities).toBeUndefined();
    });
});
