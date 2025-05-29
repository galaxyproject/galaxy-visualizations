import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: "jsdom",
        globals: true,
    },
    optimizeDeps: {
        include: ["@gmod/bam"],
    },
    ssr: {
        noExternal: ["@gmod/bam"],
    },
});
