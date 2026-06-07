import { defineConfig } from "@playwright/test";

export default defineConfig({
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
    testIgnore: ["src/**"],
    timeout: 60000,
    use: {
        headless: true,
        launchOptions: {
            executablePath: "/snap/bin/chromium",
            args: ["--no-sandbox", "--disable-gpu"],
        },
    },
    webServer: {
        command: "GALAXY_DATASET_ID=__test__ npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
