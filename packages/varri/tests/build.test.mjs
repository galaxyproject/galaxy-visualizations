import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_DIR = path.join(ROOT, "static");
const PUBLIC_DIR = path.join(ROOT, "public");

const REQUIRED_UPSTREAM_FILES = [
    "index.html",
    "index.js",
    "style.css",
    "dist/vaRRI.min.js",
    "src/vaRRI.js",
    "fornac/fornac.js",
    "fornac/fornac.css",
    "fornac/d3.js",
    "LICENSE",
];

test("build output exists (run npm run build first)", () => {
    assert.ok(fs.existsSync(STATIC_DIR), "static/ directory missing - run `npm run build`");
    for (const file of REQUIRED_UPSTREAM_FILES) {
        assert.ok(fs.existsSync(path.join(STATIC_DIR, file)), `missing upstream file: ${file}`);
    }
});

test("Galaxy glue files are staged and not clobbered by upstream", () => {
    for (const file of fs.readdirSync(PUBLIC_DIR)) {
        const staged = path.join(STATIC_DIR, file);
        assert.ok(fs.existsSync(staged), `missing glue file in static/: ${file}`);
        assert.deepStrictEqual(
            fs.readFileSync(staged, "utf8"),
            fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8"),
            `glue file diverged from public/: ${file}`
        );
    }
});

test("varri.xml is a valid plugin configuration", () => {
    const xml = fs.readFileSync(path.join(STATIC_DIR, "varri.xml"), "utf8");
    assert.match(xml, /<visualization[^>]*name="vaRRI"/);
    assert.match(xml, /<model_class>HistoryDatasetAssociation<\/model_class>/);
    assert.match(xml, /<entry_point[^>]*src="varri\.js"/);
});

test("varri.js glue loads the upstream GUI from its own location", () => {
    const js = fs.readFileSync(path.join(STATIC_DIR, "varri.js"), "utf8");
    assert.match(js, /api\/datasets/);
    assert.match(js, /showRenderingOnly/);
    assert.match(js, /index\.html/);
});

test("upstream provenance is recorded", () => {
    const source = fs.readFileSync(path.join(STATIC_DIR, "SOURCE.txt"), "utf8");
    assert.match(source, /BackofenLab\/vaRRI-js/);
});

test("staged index.html hides the upstream header and footer", () => {
    const html = fs.readFileSync(path.join(STATIC_DIR, "index.html"), "utf8");
    assert.match(html, /data-galaxy-plugin-varri[^>]*>\s*header,\s*footer\s*\{\s*display:\s*none\s*!important\s*\}/);
});
