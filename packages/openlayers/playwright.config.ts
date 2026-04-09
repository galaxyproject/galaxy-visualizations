import { defineConfig } from "@playwright/test";

export default defineConfig({
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
    testIgnore: ["src/**"],
    use: {
        headless: !!process.env.CI,
    },
});
