import { defineConfig } from "@playwright/test";

export default defineConfig({
    timeout: 120000, // 120 seconds per test
    use: {
        headless: true, //!!process.env.CI,
    },
    webServer: {
        command: "npm run dev",
        url: "http://localhost:8000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
