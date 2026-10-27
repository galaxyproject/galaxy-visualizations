export const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = new Set(["geojson", "las", "laz", "geocsv"]);

export function galaxyRoot(root, base = window.location.href) {
    const url = new URL(root || "/", base);
    // Galaxy injects plugins into about:blank frames, whose Location has a null
    // origin even though their actual window origin is inherited from Galaxy.
    if (url.origin !== window.origin) throw new Error("Galaxy must be served on the visualization's origin.");
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
}

export function datasetSource(dataset, root, datasetId) {
    const extension = dataset.extension || dataset.file_ext;
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error(`Unsupported dataset format: ${extension || "unknown"}.`);
    if (dataset.accessible === false) throw new Error("You do not have permission to view this dataset.");
    if (dataset.deleted || dataset.purged) throw new Error("This dataset has been deleted or purged.");
    if (!["ok", "deferred"].includes(dataset.state))
        throw new Error(`This dataset is not ready (state: ${dataset.state || "unknown"}).`);

    let url;
    if (dataset.state === "deferred") {
        // Galaxy checks the primary source when deciding plugin applicability.
        const primary = dataset.sources?.[0];
        if (!primary?.source_uri) throw new Error("This deferred dataset has no source URL.");
        if (primary.transform?.length)
            throw new Error(
                "This deferred dataset requires Galaxy transformations. Materialize it before opening RustGIS.",
            );
        try {
            url = new URL(primary.source_uri);
        } catch {
            throw new Error("This deferred dataset has an invalid source URL.");
        }
        if (!["http:", "https:"].includes(url.protocol))
            throw new Error("Deferred datasets require an HTTP(S) source URL.");
        if (url.username || url.password)
            throw new Error("URLs containing login credentials are not supported. Use an accessible or signed URL.");
        if (root.protocol === "https:" && url.protocol === "http:")
            throw new Error("An HTTPS Galaxy page requires an HTTPS dataset source.");
    } else {
        url = new URL(`api/datasets/${encodeURIComponent(datasetId)}/display`, root);
        url.searchParams.set("preview", "false");
    }
    if (dataset.file_size > MAX_DOWNLOAD_BYTES)
        throw new Error("This file exceeds RustGIS's 256 MiB browser download limit. Use a smaller extract.");
    const name = typeof dataset.name === "string" ? dataset.name.trim() : "";
    return { url: url.href, name: name || `Dataset ${datasetId}`, extension, deferred: dataset.state === "deferred" };
}
