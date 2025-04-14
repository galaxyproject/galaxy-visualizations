import { searchForWorkspaceRoot } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("vite").UserConfig} */
const config = {
    // https://github.com/rerun-io/rerun/issues/6815
    optimizeDeps: {
        exclude: process.env.NODE_ENV === "production" ? [] : ["@rerun-io/web-viewer"],
    },
    server: {
        port: 5173,

        fs: {
            allow: [
                searchForWorkspaceRoot(process.cwd()),
                // NOTE: hack to allow `new URL("file://...")` in `web-viewer` when it is a linked package
                fs.realpathSync(path.join(__dirname, "node_modules", "@rerun-io/web-viewer")),
            ],
        },
    },
};

// Support deployment to GitHub Pages
if ("REPOSITORY" in process.env) {
    config.base = `/${process.env.REPOSITORY}/`;
}

export default config;
