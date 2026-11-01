import { defineConfig } from "@playwright/test";

import { visualizationConfig } from "../../playwright.shared.mjs";

const config = visualizationConfig({ timeout: 120_000, screenshots: false });

export default defineConfig({ ...config, testIgnore: [...config.testIgnore, "compat/**", "integration/**"] });
