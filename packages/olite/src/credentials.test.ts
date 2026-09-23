import { describe, expect, it } from "vitest";
import { credentialProblem, providerById, providers } from "./credentials";

describe("credentialProblem", () => {
    it("asks for a provider when nothing is chosen", () => {
        expect(credentialProblem(null)).toBeTruthy();
    });

    it("rejects a provider the registry does not know", () => {
        expect(credentialProblem({ provider: "nope" })).toContain("Unknown provider");
    });

    it("requires a key for a provider whose endpoint authenticates", () => {
        expect(credentialProblem({ provider: "openrouter", model: "openai/gpt-5.6-terra" }))
            .toContain("requires an API key");
    });

    it("accepts a keyed provider once the key and model are supplied", () => {
        expect(
            credentialProblem({
                provider: "openrouter",
                model: "openai/gpt-5.6-terra",
                apiKey: "k",
            }),
        ).toBeNull();
    });

    it("needs no key for the Galaxy proxy", () => {
        expect(credentialProblem({ provider: "galaxy" })).toBeNull();
    });

    it("lets a local server name its own model", () => {
        expect(providerById("ollama")?.free_model).toBe(true);
        expect(credentialProblem({ provider: "ollama" })).toBeNull();
    });
});

describe("reaching the models an Orbit user already has", () => {
    it("offers every provider Orbit offers, so a familiar setup is possible", () => {
        // Orbit's user-facing list (ipc-handlers.ts models:list-all), mapped to our ids:
        // google -> gemini, ollama -> local. openai-codex is a sign-in flow we do not have.
        const wanted = ["openai", "anthropic", "google", "deepseek", "openrouter", "groq", "mistral", "xai", "ollama"];
        const have = providers.map((p) => p.id);
        expect(wanted.filter((id) => !have.includes(id))).toEqual([]);
    });

    it("lets a hosted provider's model be typed, since its catalog is not ours to bundle", () => {
        for (const id of ["openai", "anthropic", "groq", "mistral", "xai"]) {
            expect(providerById(id)!.free_model).toBe(true);
            expect(providerById(id)!.takes_model).toBe(true);
        }
    });

    it("asks the Galaxy proxy for no model at all", () => {
        expect(providerById("galaxy")!.takes_model).toBe(false);
    });

    it("accepts a model outside the bundled suggestions", () => {
        // OpenRouter lists hundreds; ours are suggestions, never the allowed set.
        const creds = { provider: "openrouter", model: "some/model-we-never-listed", apiKey: "k" };
        expect(credentialProblem(creds)).toBeNull();
    });

    it("requires a model from a hosted provider, which fails on the first request without one", () => {
        expect(credentialProblem({ provider: "openai", apiKey: "k" })).toMatch(/name a model/i);
    });

    it("needs no model for a server that ignores the name", () => {
        expect(credentialProblem({ provider: "ollama" })).toBeNull();
    });

    it("refuses an endpoint that is not a URL rather than failing at request time", () => {
        const creds = { provider: "openai", model: "m", apiKey: "k", baseUrl: "my-server:8000" };
        expect(credentialProblem(creds)).toMatch(/http/i);
    });

    it("accepts a self-hosted endpoint", () => {
        const creds = { provider: "openai", model: "m", apiKey: "k", baseUrl: "https://llm.internal/v1" };
        expect(credentialProblem(creds)).toBeNull();
    });
});
