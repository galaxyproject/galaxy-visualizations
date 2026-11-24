import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const viewerRoot = fileURLToPath(new URL("./node_modules/big-tree-viewer", import.meta.url));
const viewerFiles = ["icon-192.png", "example_tree.btvsession"];

const copyViewerFiles = () => ({
    name: "copy-viewer-files",
    generateBundle() {
        for (const fileName of viewerFiles) {
            this.emitFile({ type: "asset", fileName, source: readFileSync(`${viewerRoot}/public/${fileName}`) });
        }
    },
});

export default defineConfig({
    root: viewerRoot,
    base: "./",
    publicDir: false,
    plugins: [react(), copyViewerFiles()],
    build: {
        outDir: fileURLToPath(new URL("./public/viewer", import.meta.url)),
        emptyOutDir: true,
    },
});
