import { defineConfig } from "@playwright/test";

export default defineConfig({
    timeout: 120000, // 120 seconds per test
    use: {
        headless: !!process.env.CI,
    },
});
