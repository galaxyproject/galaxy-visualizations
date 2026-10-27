import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const pin = JSON.parse(await readFile(path.join(root, "upstream.json"), "utf8"));
const cache = path.join(root, ".vendor");
const output = path.join(root, "public/vendor/rustgis");

// Git blob IDs bind both the byte length and content to the pinned upstream tree.
function verify(bytes, file) {
    return (
        bytes.length === file.size &&
        createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") === file.sha
    );
}

await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
await Promise.all(
    pin.files.map(async (file) => {
        const cached = path.join(cache, file.path);
        let bytes = await readFile(cached).catch(() => null);
        if (!bytes || !verify(bytes, file)) {
            console.log(`Downloading pinned RustGIS asset: ${file.path}`);
            const url = `https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/${file.path}`;
            let failure;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    bytes = Buffer.from(await response.arrayBuffer());
                    if (!verify(bytes, file)) throw new Error("Upstream asset integrity check failed");
                    failure = undefined;
                    break;
                } catch (error) {
                    failure = error;
                }
            }
            if (failure) throw new Error(`Cannot prepare ${file.path}: ${failure.message}`, { cause: failure });
            await mkdir(path.dirname(cached), { recursive: true });
            await writeFile(`${cached}.tmp`, bytes);
            await rename(`${cached}.tmp`, cached);
        }
        const target = path.join(output, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(cached, target);
    }),
);
for (const file of ["index.html", "loader.js"]) {
    await copyFile(path.join(root, "viewer", file), path.join(output, file));
}
await copyFile(path.join(root, "LICENSE"), path.join(root, "public/ADAPTER-LICENSE.txt"));
await writeFile(
    path.join(output, "build.json"),
    JSON.stringify({
        module: pin.files.find((file) => /^rustgis-web-.*\.js$/.test(file.path)).path,
        wasm: pin.files.find((file) => file.path.endsWith(".wasm")).path,
        sourceRevision: pin.sourceRevision,
    }),
);
console.log(`RustGIS ${pin.sourceRevision.slice(0, 12)} prepared, with license notices.`);
