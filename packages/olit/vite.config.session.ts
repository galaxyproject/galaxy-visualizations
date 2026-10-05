import { defineConfig } from "vite";

// The agent as one Node module, for the evaluation harness.
export default defineConfig({
  build: {
    ssr: "src/agent/node.ts",
    outDir: "dist",
    emptyOutDir: false,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "session.mjs" } },
  },
  ssr: { noExternal: true, external: ["pyodide"] },
});
