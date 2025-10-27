import { defineConfig } from "@playwright/test";

export default defineConfig({
    expect: {
        toMatchSnapshot: {
            maxDiffPixelRatio: 0.03
        }
    },
    use: {
        headless: !!process.env.CI
    },
    snapshotPathTemplate: "{testDir}/test-data/{arg}.png"
});
