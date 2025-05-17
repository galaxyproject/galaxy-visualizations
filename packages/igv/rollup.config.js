// rollup.config.js
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default {
    input: "src/igv_entrypoint.js",
    output: {
        file: "static/dist/igv_entrypoint.js",
        format: "iife",
        name: "IGV",
        sourcemap: true,
    },
    plugins: [
        nodeResolve({
            browser: true,
            preferBuiltins: false,
        }),
        commonjs(),
        json(),
    ],
};
