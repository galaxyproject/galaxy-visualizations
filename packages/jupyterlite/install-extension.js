import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Detect wheel ----
const distDir = path.join(__dirname, "gxy/dist");
const wheelFiles = fs.readdirSync(distDir).filter((f) => /^gxy-.*\.whl$/.test(f));
if (wheelFiles.length === 0) {
    console.error("❌ No matching GXY wheel found in gxy/dist/");
    process.exit(1);
}

// ---- Declare paths ----
const JUPYTER_DIR = "static/dist/_output";
const EXTENSION_NAME = "jl-galaxy";
const CONFIG_PATH = path.join(__dirname, JUPYTER_DIR, "jupyter-lite.json");
const GXY_SOURCE_WHEEL = path.join(distDir, wheelFiles[0]);
const GXY_TARGET_DIR = path.join(__dirname, JUPYTER_DIR, "pypi");
const GXY_TARGET_WHEEL = path.join(GXY_TARGET_DIR, path.basename(GXY_SOURCE_WHEEL));

// ---- Optionally disable extensions e.g. side panel ----
const DISABLED = [
    "@jupyterlab/filebrowser-extension",
    "@jupyterlab/launcher-extension",
    "@jupyterlab/running-extension",
    "@jupyterlab/toc-extension",
    "@jupyterlab/fileeditor-extension:plugin",
    "@jupyterlab/fileeditor-extension:cursor-position",
    "@jupyterlab/fileeditor-extension:completer",
    "@jupyterlab/fileeditor-extension:language-server",
    "@jupyterlab/fileeditor-extension:editor-syntax-status",
    "@jupyterlab/fileeditor-extension:tab-space-status",
    "@jupyterlab/notebook-extension:toc",
    "@jupyterlite/application-extension:share-file",
    "@jupyterlab/tooltip-extension:files",
];

// ---- Ensure base output dir exists ----
fs.mkdirSync(path.join(__dirname, JUPYTER_DIR), { recursive: true });

// ---- Create base config if missing ----
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    console.log("✅ Loaded existing jupyter-lite.json");
} else {
    console.error(`❌ jupyter-lite.json not found at ${CONFIG_PATH}`);
    process.exit(1);
}

// ---- Setup jupyter-config-data ----
if (!config["jupyter-config-data"]) {
    config["jupyter-config-data"] = {};
}
const jupyterConfig = config["jupyter-config-data"];

// ---- Copy GXY wheel to _output/pypi ----
fs.mkdirSync(GXY_TARGET_DIR, { recursive: true });
fs.copyFileSync(GXY_SOURCE_WHEEL, GXY_TARGET_WHEEL);
console.log(`✅ Copied GXY wheel → ${GXY_TARGET_WHEEL}`);

// ---- Add GXY wheel to kernel extension ----
jupyterConfig.litePluginSettings = {
    "@jupyterlite/pyodide-kernel-extension:kernel": {
        loadPyodideOptions: {
            packages: [`../../../../pypi/${path.basename(GXY_SOURCE_WHEEL)}`],
        },
    },
};

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
