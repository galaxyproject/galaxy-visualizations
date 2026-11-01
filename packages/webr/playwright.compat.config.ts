import { defineConfig } from "@playwright/test";

import { visualizationConfig } from "../../playwright.shared.mjs";

const config = visualizationConfig({ timeout: 1_800_000, screenshots: false });

export default defineConfig({ ...config, testDir: "compat", testMatch: ["compat.spec.js"], workers: 1 });
