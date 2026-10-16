import { defineConfig } from "@playwright/test";

import { visualizationConfig } from "../../playwright.shared.mjs";

export default defineConfig(visualizationConfig({ timeout: 60_000 }));
