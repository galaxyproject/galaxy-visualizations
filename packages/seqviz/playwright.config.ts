import { defineConfig } from "@playwright/test";

export default defineConfig({
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
    testIgnore: ["src/**"],
    timeout: 60000,
    use: {
        headless: !!process.env.CI,
    },
    webServer: {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
