import { defineConfig } from "@playwright/test";

const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "npm run dev";

export default defineConfig({
    testIgnore: ["src/**"],
    timeout: 120000,
    use: {
        headless: !!process.env.CI,
    },
    webServer: {
        command: webServerCommand,
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
