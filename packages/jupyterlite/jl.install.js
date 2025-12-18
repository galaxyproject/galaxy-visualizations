import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Detect wheel ----
const distDir = path.join(__dirname, "gxy/dist");
const gxyWheelFiles = fs.readdirSync(distDir).filter((f) => /^gxy-.*\.whl$/.test(f));
if (gxyWheelFiles.length === 0) {
    console.error("❌ No matching GXY wheel found in gxy/dist/");
    process.exit(1);
}

// ---- Declare paths ----
const JUPYTER_DIR = "static/dist/_output";
const EXTENSION_NAME = "jl-galaxy";
const CONFIG_PATH = path.join(__dirname, JUPYTER_DIR, "jupyter-lite.json");
const PYPI_DIR = path.join(__dirname, JUPYTER_DIR, "pypi");
const GXY_SOURCE_WHEEL = path.join(distDir, gxyWheelFiles[0]);
const GXY_TARGET_WHEEL = path.join(PYPI_DIR, path.basename(GXY_SOURCE_WHEEL));

const PYODIDE_KERNEL = "@jupyterlite/pyodide-kernel-extension:kernel";
const PYPI_PATH = "../../../../pypi/";

// ---- Optionally disable extensions e.g. side panel ----
const DISABLED = [];

// ---- Ensure base output dir exists ----
fs.mkdirSync(path.join(__dirname, JUPYTER_DIR), { recursive: true });

// ---- Create base config if missing ----
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    console.log("✅ Loaded existing jupyter-lite.json");
} else {
    console.log("✅ Creating new jupyter-lite.json");
}

// ---- Setup jupyter-config-data ----
if (!config["jupyter-config-data"]) {
    config["jupyter-config-data"] = {};
}
const jupyterConfig = config["jupyter-config-data"];

// ---- Copy GXY wheel to _output/pypi ----
fs.mkdirSync(PYPI_DIR, { recursive: true });
fs.copyFileSync(GXY_SOURCE_WHEEL, GXY_TARGET_WHEEL);
console.log(`✅ Copied GXY wheel → ${GXY_TARGET_WHEEL}`);

// ---- Pyodide dependencies ----
const INSTALL = [];
const dependenciesPath = path.join(__dirname, "jl.pyodide.deps.txt");
const deps = fs.readFileSync(dependenciesPath, "utf-8").split(/\r?\n/);
for (const line of deps) {
    const v = line.trim();
    if (v !== "" && !v.startsWith("#")) {
        INSTALL.push(v);
    }
}

// ---- Download additional wheels ----
const requirementsPath = path.join(__dirname, "jl.pyodide.txt");
const pipDownload = spawnSync("pip", ["download", "--dest", PYPI_DIR, "-r", requirementsPath], {
    stdio: "inherit",
});
if (pipDownload.status !== 0) {
    console.error("❌ pip download failed");
    process.exit(1);
}

// ---- Collect names of additional wheels ----
const wheelFiles = fs
    .readdirSync(PYPI_DIR)
    .filter((f) => f.endsWith(".whl"))
    .filter((f) => {
        const isValid = f.includes("-none-any.whl");
        if (!isValid) {
            const baseName = f.split("-")[0].replace(/_/g, "-");
            if (!INSTALL.includes(baseName)) {
                console.error(`❌ Native wheel detected, must be replaced with WASM-compatible version: ${f}`);
                process.exit(1);
            }
            fs.unlinkSync(path.join(PYPI_DIR, f));
        }
        return isValid;
    });

// ---- Log names of additional wheels ----
for (const file of wheelFiles) {
    console.log(`✅ Found downloaded wheel: ${file}`);
}

// ---- Add GXY and pip-downloaded wheels to kernel extension ----
const urls = [GXY_SOURCE_WHEEL, ...wheelFiles.map((f) => path.join(PYPI_DIR, f))];
jupyterConfig.litePluginSettings = {
    [PYODIDE_KERNEL]: {
        loadPyodideOptions: {
            packages: [...urls.map((fullPath) => `${PYPI_PATH}${path.basename(fullPath)}`), ...INSTALL],
        },
    },
};

// ---- Ensure in-memory storage driver only ----
jupyterConfig.enableMemoryStorage = true;
jupyterConfig.contentsStorageDrivers = ["memoryStorageDriver"];
jupyterConfig.settingsStorageDrivers = ["memoryStorageDriver"];
jupyterConfig.workspacesStorageDrivers = ["memoryStorageDriver"];

// ---- Ensure federated_extensions array exists and add plugin ----
const federated = (jupyterConfig.federated_extensions ||= []);
const EXTENSION_ENTRY = {
    name: EXTENSION_NAME,
    load: "entry.js",
    extension: "./extension",
};
const exists = federated.some(
    (e) =>
        e.name === EXTENSION_ENTRY.name && e.load === EXTENSION_ENTRY.load && e.extension === EXTENSION_ENTRY.extension,
);
if (!exists) {
    federated.push(EXTENSION_ENTRY);
    console.log(`✅ Registered '${EXTENSION_NAME}' in federated_extensions`);
} else {
    console.log(`✅ '${EXTENSION_NAME}' already registered`);
}

// ---- Disable plugins ----
jupyterConfig.disabledExtensions = Array.from(new Set([...(jupyterConfig.disabledExtensions || []), ...DISABLED]));
console.log(`✅ Disabled sidebar extensions: ${DISABLED.join(", ")}`);

// ---- Copy extension files ----
const extDestDir = path.join(__dirname, JUPYTER_DIR, "extensions", EXTENSION_NAME);
fs.mkdirSync(extDestDir, { recursive: true });
const extensionFiles = [
    { src: path.join(__dirname, "build/extension.js"), dest: "extension.js" },
    { src: path.join(__dirname, "src/entry.js"), dest: "entry.js" },
];
for (const { src, dest } of extensionFiles) {
    const fullDest = path.join(extDestDir, dest);
    fs.copyFileSync(src, fullDest);
    console.log(`✅ Copied ${src} → ${fullDest}`);
}

// ---- Write final jupyter-lite.json ----
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
console.log("✅ Wrote updated jupyter-lite.json");

// ---- Add empty placeholder directory ----
const allJsonPath = path.join(__dirname, JUPYTER_DIR, "api/contents/all.json");
fs.mkdirSync(path.dirname(allJsonPath), { recursive: true });
const EMPTY_DIR_JSON = {
    name: "all",
    path: "all",
    type: "directory",
    content: [],
    format: "json",
};
fs.writeFileSync(allJsonPath, JSON.stringify(EMPTY_DIR_JSON, null, 2));
console.log(`✅ Created placeholder contents file: ${allJsonPath}`);

// ---- Injecting dynamic configuration ----
const configScriptPath = path.join(__dirname, "jl.config.js");
const configInstall = spawnSync("node", [configScriptPath], {
    stdio: "inherit"
});
if (configInstall.status !== 0) {
    console.error("❌ patching configuration failed.");
    process.exit(1);
}
