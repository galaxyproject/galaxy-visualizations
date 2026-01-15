import fs from "fs";
import path from "path";

// Injection
const MARKER = "const config = await jupyterConfigData();";
const UNIQUE = "//__GXY__INJECTION__";
const INJECTION = fs.readFileSync(path.resolve("jl.injection.js"), "utf-8");

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
