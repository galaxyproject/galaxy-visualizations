import { defineConfig } from "@playwright/test";

export default defineConfig({
    use: {
        headless: !!process.env.CI,
    },
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
    webServer: {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
