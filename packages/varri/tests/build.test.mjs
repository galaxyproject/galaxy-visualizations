import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_DIR = path.join(ROOT, "static");

test("build output exists (run npm run build first)", () => {
    assert.ok(fs.existsSync(STATIC_DIR), "static/ directory missing - run `npm run build`");
    assert.ok(fs.existsSync(path.join(STATIC_DIR, "index.js")), "missing bundled index.js");
    assert.ok(fs.existsSync(path.join(STATIC_DIR, "index.css")), "missing bundled index.css");
    assert.ok(fs.existsSync(path.join(STATIC_DIR, "varri.xml")), "missing varri.xml plugin descriptor");
    assert.ok(fs.existsSync(path.join(STATIC_DIR, "logo.svg")), "missing logo.svg");
});

test("vendor assets are staged (run npm run build first)", () => {
    const vendorDir = path.join(STATIC_DIR, "vendor", "varri-js");
    for (const file of ["index.html", "index.js", "style.css", "fornac/d3.js", "fornac/fornac.js", "fornac/fornac.css", "src/vaRRI.js", "LICENSE"]) {
        assert.ok(fs.existsSync(path.join(vendorDir, file)), `missing vendored varri-js asset: ${file}`);
    }
});

test("varri.xml is a valid plugin configuration", () => {
    const xml = fs.readFileSync(path.join(STATIC_DIR, "varri.xml"), "utf8");
    assert.match(xml, /<visualization[^>]*name="vaRRI"/);
    assert.match(xml, /<model_class>HistoryDatasetAssociation<\/model_class>/);
    assert.match(xml, /<entry_point[^>]*src="index\.js"[^>]*css="index\.css"/);
});

test("bundled index.js embeds the unmodified upstream viewer, relative to its own module URL", () => {
    // Galaxy's VisualizationFrame.vue injects only a single <script src="index.js">
    // into a blank iframe and never loads index.html, so index.js (built from
    // main.js) must locate its own vendored viewer at runtime - it cannot rely on
    // <script>/<iframe> tags placed in index.html by this repo's local dev server.
    const js = fs.readFileSync(path.join(STATIC_DIR, "index.js"), "utf8");
    assert.match(js, /import\.meta\.url/, "the vendored viewer must be located relative to import.meta.url");
    assert.match(js, /vendor\/varri-js\/index\.html/, "must embed the vendored upstream viewer's index.html");
});


