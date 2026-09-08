import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    // The package ships public/ to static/ in a separate step; keep it out of the bundle dir.
    publicDir: false,
    // settingregistry imports `parse` by name; json5's ESM build only has a default export,
    // so resolve it to the CommonJS build that does provide named exports.
    resolve: { alias: { json5: "json5/dist/index.js" } },
    build: {
        outDir: "build",
        target: "es2022",
        minify: "esbuild",
        // Not `build.lib`: library mode leaves ES output unminified for downstream bundlers,
        // and this bundle is loaded directly by the browser as a federated extension.
        rollupOptions: {
            input: resolve(__dirname, "src/extension.ts"),
            // Vite drops entry exports for app builds; the plugin export is the whole point.
            preserveEntrySignatures: "strict",
            output: {
                format: "es",
                entryFileNames: "extension.js",
                inlineDynamicImports: true,
            },
        },
    },
});
