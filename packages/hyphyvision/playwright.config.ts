import { defineConfig } from "@playwright/test";

export default defineConfig({
    testIgnore: ["src/**"],
    timeout: 120000, // 120 seconds per test
    use: {
        headless: !!process.env.CI,
    },
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
});
