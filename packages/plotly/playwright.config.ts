import { defineConfig } from "@playwright/test";

export default defineConfig({
    timeout: 120000,
    use: {
        headless: !!process.env.CI,
    },
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
});
