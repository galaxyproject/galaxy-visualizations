import { defineConfig } from "@playwright/test";

import { visualizationConfig } from "../../playwright.shared.mjs";

export default defineConfig(visualizationConfig({
    port: 8000,
    command: (port) => `npm run dev -- --port ${port}`,
}));
