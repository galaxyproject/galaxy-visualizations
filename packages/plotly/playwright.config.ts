import { defineConfig } from "@playwright/test";

export default defineConfig({
    use: {
        headless: !!process.env.CI,
        launchOptions: {
            args: ["--font-render-hinting=none", "--disable-lcd-text"],
        },
    },
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
});
