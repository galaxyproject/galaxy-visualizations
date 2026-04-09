import { defineConfig } from "@playwright/test";

export default defineConfig({
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
    testIgnore: ["src/**"],
    use: {
        headless: !!process.env.CI,
    },
    webServer: {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        stdout: "ignore",
        stderr: "pipe",
    },
});
