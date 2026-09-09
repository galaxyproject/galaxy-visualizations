import { defineConfig } from "@playwright/test";

import { visualizationConfig } from "../../playwright.shared.mjs";

export default defineConfig(
    visualizationConfig({
        use: {
            launchOptions: {
                // Modern Chromium gates software WebGL behind these flags; Molstar needs them headless.
                args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
            },
        },
    }),
);
