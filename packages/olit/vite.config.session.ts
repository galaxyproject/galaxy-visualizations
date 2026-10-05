import { defineConfig } from "vite";

// The agent as one Node module, for the evaluation harness.
export default defineConfig({
  build: {
    ssr: "src/agent/node.ts",
    outDir: "dist",
    emptyOutDir: false,
    target: "node22",
    // One file: a lazy chunk importing back from an entry that is still in its top-level
    // await never resolves, and the entry awaits the chunk.
    rollupOptions: { output: { entryFileNames: "session.mjs", inlineDynamicImports: true } },
  },
  // vega's Node build calls require(), which an ES module bundle cannot; Node loads it itself.
  ssr: { noExternal: true, external: ["pyodide", "vega", "vega-lite"] },
});
