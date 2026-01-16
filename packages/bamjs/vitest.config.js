import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [],
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
