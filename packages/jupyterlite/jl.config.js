import fs from "fs";
import path from "path";

// Injection
const MARKER = "const config = await jupyterConfigData();";
const UNIQUE = "//__GXY__INJECTION__";

const INJECTION = `
    const AI_SETTINGS = "@jupyterlite/ai:settings-model";
    const PYODIDE_KERNEL = "@jupyterlite/pyodide-kernel-extension:kernel";
    const searchParams = Object.fromEntries(new URL(window.location.href).searchParams.entries());
    config.litePluginSettings[PYODIDE_KERNEL].loadPyodideOptions.env = {
        __gxy__: JSON.stringify(searchParams)
    };
    config.settingsOverrides = {};
    config.settingsOverrides[AI_SETTINGS] = {
        defaultProvider: "jnaut",
        useSameProviderForChatAndCompleter: false,
        providers: [
            {
                id: "jnaut",
                name: "jnaut",
                provider: "generic",
                model: "jnaut",
                apiKey: "jnaut",
                baseURL: searchParams.root + "api/plugins/jupyterlite"
            }
        ]
    };
`;

// Read contents
const file = path.resolve("static/dist/_output/config-utils.js");
if (!fs.existsSync(file)) {
    console.error(`[jl.config.js] ❌ Patch failed: ${file} not found. Did you run 'jupyter lite build' first?`);
    process.exit(1);
}

let contents = fs.readFileSync(file, "utf-8");

// Ensure marker exists before mutation
if (!contents.includes(MARKER)) {
    console.error("[jl.config.js] ❌ Patch failed: marker line not found.");
    process.exit(1);
}

// Remove previous injection if present
const uniqueEsc = UNIQUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blockRe = new RegExp(`${uniqueEsc}[\\s\\S]*?${uniqueEsc}\\n?`, "g");
contents = contents.replace(blockRe, "");

// Inject fresh block
const patched = contents.replace(MARKER, `${MARKER}\n${UNIQUE}\n${INJECTION}\n${UNIQUE}`);

fs.writeFileSync(file, patched, "utf-8");
console.log("✅ Successfully injected dynamic configuration.");
