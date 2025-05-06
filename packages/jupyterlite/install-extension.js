import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_NAME = "jl-galaxy";
const EXTENSION_FILE = path.join(__dirname, "build/extension.js");
const ENTRY_FILE = path.join(__dirname, "src/entry.js");
const DEST_DIR = path.join(__dirname, "_output", "extensions", EXTENSION_NAME);
const DEST_EXTENSION_FILE = path.join(DEST_DIR, "extension.js");
const DEST_ENTRY_FILE = path.join(DEST_DIR, "entry.js");
const CONFIG_PATH = path.join(__dirname, "_output", "jupyter-lite.json");

const EXTENSION_ENTRY = {
    name: EXTENSION_NAME,
    load: "entry.js",
    extension: "./extension",
};

// ---- Copy extension file ----
fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(EXTENSION_FILE, DEST_EXTENSION_FILE);
console.log(`✅ Copied ${EXTENSION_FILE} → ${DEST_EXTENSION_FILE}`);

// ---- Copy entry file ----
fs.copyFileSync(ENTRY_FILE, DEST_ENTRY_FILE);
console.log(`✅ Copied ${ENTRY_FILE} → ${DEST_ENTRY_FILE}`);

// ---- Patch correct federated_extensions ----
if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ jupyter-lite.json not found at ${CONFIG_PATH}`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

if (!config["jupyter-config-data"]) {
    config["jupyter-config-data"] = {};
}
const federated = (config["jupyter-config-data"].federated_extensions ||= []);

const exists = federated.some(
    (e) =>
        e.name === EXTENSION_ENTRY.name &&
        e.load === EXTENSION_ENTRY.load &&
        e.extension === EXTENSION_ENTRY.extension &&
        e.liteExtension === EXTENSION_ENTRY.liteExtension,
);

if (!exists) {
    federated.push(EXTENSION_ENTRY);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`✅ Registered '${EXTENSION_NAME}' inside jupyter-config-data.federated_extensions`);
} else {
    console.log(`ℹ️ '${EXTENSION_NAME}' is already registered (exact match)`);
}
