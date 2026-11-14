import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "integration",
    testMatch: ["*.spec.js"],
    timeout: 600_000,
    workers: 1,
    use: {
        baseURL: process.env.GALAXY_URL || "http://localhost:8080",
        headless: true,
        screenshot: "only-on-failure",
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    },
});
