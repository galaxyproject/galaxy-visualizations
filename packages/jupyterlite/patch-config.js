import fs from "fs";
import path from "path";

const file = path.resolve("static/dist/_output/config-utils.js");

if (!fs.existsSync(file)) {
    console.error(`❌ Patch failed: ${file} not found. Did you run 'jupyter lite build' first?`);
    process.exit(1);
}

let contents = fs.readFileSync(file, "utf-8");

const marker = "const config = await jupyterConfigData();";
const injection = `
    const PYODIDE_KERNEL = "@jupyterlite/pyodide-kernel-extension:kernel";
    const searchParams = Object.fromEntries(new URL(window.location.href).searchParams.entries());
    config.litePluginSettings[PYODIDE_KERNEL].loadPyodideOptions.env = {
        __gxy__: JSON.stringify(searchParams)
    };
`;

// Already patched? No problem, continue silently
if (contents.includes(injection)) {
    console.log("✅ config-utils.js already patched.");
    process.exit(0);
}

// Can't patch if marker isn't found — fail fast
if (!contents.includes(marker)) {
    console.error("❌ Patch failed: marker line not found in config-utils.js.");
    process.exit(1);
}

// Inject patch
const patched = contents.replace(marker, `${marker}\n  ${injection}`);
fs.writeFileSync(file, patched, "utf-8");
console.log("✅ Patched config-utils.js.");
