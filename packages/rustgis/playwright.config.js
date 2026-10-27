import { defineConfig } from "@playwright/test";
import { visualizationConfig } from "../../playwright.shared.mjs";

export default defineConfig({
    ...visualizationConfig({
        port: 5198,
        command: (port) => `node tests/server.mjs ${port}`,
        use: { viewport: { width: 1280, height: 900 }, launchOptions: { args: ["--enable-unsafe-swiftshader"] } },
    }),
    testDir: "tests",
    workers: 1,
});
