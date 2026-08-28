import { defineConfig } from "@playwright/test";

const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "npm run dev";

export default defineConfig({
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
    testIgnore: ["src/**"],
    timeout: 120000,
    use: {
        headless: !!process.env.CI,
        launchOptions: {
            // Modern Chromium gates software WebGL behind this flag; Molstar needs it to render headless.
            args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
    },
    webServer: {
        command: webServerCommand,
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
