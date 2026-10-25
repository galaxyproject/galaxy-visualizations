import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const prefix = "/galaxy/";
const remote = "https://lidar.example.test";
const fixture = async (extension) => readFile(new URL(`./fixtures/berlin.${extension}`, import.meta.url));
const geojson = await readFile(new URL("../public/test-data/berlin.geojson", import.meta.url));

async function dataset(page, metadata = {}, { status = 200, content = geojson, displayStatus = 200 } = {}) {
    const displays = [];
    await page.route("**/galaxy/api/datasets/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/display")) {
            displays.push(route.request());
            return route.fulfill({ status: displayStatus, contentType: "application/octet-stream", body: content });
        }
        await route.fulfill({
            status,
            json: {
                id: "selected",
                name: "Berlin data",
                state: "ok",
                extension: "geojson",
                file_size: content.length,
                ...metadata,
            },
        });
    });
    return displays;
}

async function open(page, id = "selected") {
    // Observe actual upstream project messages. Tests do not replace the engine.
    await page.addInitScript(() => {
        window.rustgisProjects = [];
        window.addEventListener("message", (event) => {
            if (event.data?.rustgis === "project") window.rustgisProjects.push(JSON.parse(event.data.text));
        });
    });
    await page.goto(`${prefix}harness?dataset_id=${encodeURIComponent(id)}`);
    return page.frameLocator("#galaxy_visualization");
}

async function loaded(wrapper) {
    await expect(wrapper.locator("#app")).toHaveAttribute("data-state", "loaded", { timeout: 100_000 });
    const viewer = wrapper.frameLocator("#rustgis-viewer");
    await expect(viewer.locator("#rustgis_loading")).toHaveCount(0);
    await expect(viewer.locator("#rustgis_canvas")).toBeVisible();
    return viewer;
}

async function importedLayer(page) {
    const wrapper = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
    return wrapper.evaluate(() =>
        window.rustgisProjects
            .flatMap((project) => project.maps.flatMap((map) => map.layers))
            .find((layer) => layer.name === "Berlin data"),
    );
}

test.beforeEach(async ({ page }) => {
    // Any unexpected outbound dependency fails locally. Optional basemaps/services
    // are not needed to render the selected data.
    await page.route("https://**", (route) => route.abort());
});

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) {
        await page.screenshot({ path: info.outputPath("viewer.png") });
        console.log(
            await Promise.all(
                page.frames().map(async (frame) => ({
                    url: frame.url(),
                    text: await frame
                        .locator("body")
                        .innerText()
                        .catch(() => ""),
                })),
            ),
        );
    }
});

test("opens an authenticated stored GeoJSON dataset in Galaxy's blank frame with a prefixed root", async ({
    page,
    context,
    baseURL,
}) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.addCookies([{ name: "galaxysession", value: "test-session", url: baseURL }]);
    const requests = await dataset(page);
    const wrapper = await open(page);
    await loaded(wrapper);
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url()).pathname).toBe("/galaxy/api/datasets/selected/display");
    expect(new URL(requests[0].url()).searchParams.get("preview")).toBe("false");
    expect(await requests[0].headerValue("cookie")).toContain("galaxysession=test-session");
    const layer = await importedLayer(page);
    expect(layer.dataset.features).toHaveLength(3);
    await expect(wrapper.getByText("RustGIS · Berlin data")).toBeVisible();
    expect(errors).toEqual([]);
});

for (const extension of ["las", "laz"]) {
    test(`decodes and renders stored ${extension.toUpperCase()} point data with attributes`, async ({ page }) => {
        const requests = await dataset(page, { extension }, { content: await fixture(extension) });
        const wrapper = await open(page);
        await loaded(wrapper);
        expect(requests).toHaveLength(1);
        const layer = await importedLayer(page);
        // LiDAR layers retain their sampled rows in a view window, omitted from
        // project JSON. The renderer classes prove native decoding of all three
        // classifications; the source keeps the original compressed bytes.
        expect(layer.renderer.Unique.classes.map(([value]) => value)).toEqual(["2", "5", "6"]);
        expect(layer.source.embedded).toBe((await fixture(extension)).toString("base64"));
        expect(layer.dataset.fields.map((field) => field.name)).toEqual([
            "z",
            "intensity",
            "classification",
            "return",
            "red",
            "green",
            "blue",
        ]);
        await expect(wrapper.getByText(/500,000 sampled points/)).toBeVisible();
    });
}

for (const extension of ["geojson", "laz"]) {
    test(`opens deferred ${extension} directly from its signed source without materializing in Galaxy`, async ({
        page,
    }) => {
        const source = `${remote}/berlin.${extension}?signature=a%2Fb%2Bc`;
        const displays = await dataset(page, {
            state: "deferred",
            extension,
            file_size: 0,
            sources: [{ source_uri: source }],
        });
        let fetched;
        await page.route(`${remote}/**`, async (route) => {
            fetched = route.request().url();
            await route.fulfill({
                status: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                contentType: "application/octet-stream",
                body: extension === "geojson" ? geojson : await fixture(extension),
            });
        });
        const wrapper = await open(page);
        await loaded(wrapper);
        expect(fetched).toBe(source);
        expect(displays).toHaveLength(0);
        const layer = await importedLayer(page);
        if (extension === "geojson") expect(layer.dataset.features).toHaveLength(3);
        else expect(layer.renderer.Unique.classes.map(([value]) => value)).toEqual(["2", "5", "6"]);
    });
}

test("shows dataset access failures without starting the viewer", async ({ page }) => {
    await dataset(page, {}, { status: 403 });
    const wrapper = await open(page);
    await expect(wrapper.getByRole("alert")).toHaveText("Could not access the dataset (HTTP 403).");
    await expect(wrapper.locator("#rustgis-viewer")).toHaveCount(0);
});

for (const [name, content, isTable] of [
    ["coordinate CSV", "name,longitude,latitude\nGate,13.3777,52.5163\nSquare,13.4132,52.5219\n", false],
    ["standalone CSV table", "name,value\nGate,35\nSquare,70\n", true],
]) {
    test(`opens a ${name} without leaving the loading indicator visible`, async ({ page }) => {
        await dataset(page, { extension: "csv" }, { content: Buffer.from(content) });
        const wrapper = await open(page);
        await loaded(wrapper);
        const frame = page.frames().find((item) => item.parentFrame() === page.mainFrame());
        const project = await frame.evaluate(() => window.rustgisProjects.at(-1));
        const rows = isTable ? project.tables[0].features : project.maps[0].layers[0].dataset.features;
        expect(rows).toHaveLength(2);
    });
}

test("reads a deferred tiled GeoTIFF by range and recognizes its tile layer", async ({ page }) => {
    const url = `${remote}/berlin.tif`;
    const bytes = await fixture("tif");
    const displays = await dataset(page, { extension: "tiff", state: "deferred", sources: [{ source_uri: url }] });
    const ranges = [];
    await page.route(`${remote}/**`, async (route) => {
        const range = route.request().headers().range;
        const headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range",
            "Accept-Ranges": "bytes",
        };
        if (!range) return route.fulfill({ status: 200, headers, body: bytes });
        ranges.push(range);
        const match = range.match(/^bytes=(\d*)-(\d*)$/);
        const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
        const end = Math.min(match[1] && match[2] ? Number(match[2]) : bytes.length - 1, bytes.length - 1);
        if (start >= bytes.length)
            return route.fulfill({ status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
        await route.fulfill({
            status: 206,
            headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
            body: bytes.subarray(start, end + 1),
        });
    });
    const wrapper = await open(page);
    await loaded(wrapper);
    expect(displays).toHaveLength(0);
    expect(ranges.length).toBeGreaterThan(0);
    const frame = page.frames().find((item) => item.parentFrame() === page.mainFrame());
    const tiles = await frame.evaluate(() => window.rustgisProjects.at(-1).maps[0].tiles);
    expect(tiles.some((tile) => tile.name === "Berlin data" && tile.url === url)).toBe(true);
});

for (const [label, metadata, message] of [
    ["missing source", { state: "deferred", sources: [] }, "has no source URL"],
    [
        "file-source URI",
        { state: "deferred", sources: [{ source_uri: "gxfiles://private/cloud.laz" }] },
        "HTTP(S) source URL",
    ],
    [
        "source transformations",
        {
            state: "deferred",
            sources: [{ source_uri: `${remote}/data.geojson`, transform: [{ action: "to_posix_lines" }] }],
        },
        "requires Galaxy transformations",
    ],
    ["oversized LAZ", { extension: "laz", file_size: 257 * 1024 * 1024 }, "256 MiB browser download limit"],
    ["unready dataset", { state: "running" }, "not ready"],
    ["unsupported format", { extension: "bam" }, "Unsupported dataset format"],
]) {
    test(`explains ${label} before downloading data`, async ({ page }) => {
        const displays = await dataset(page, metadata);
        const wrapper = await open(page);
        await expect(wrapper.getByRole("alert")).toContainText(message);
        await expect(wrapper.locator("#rustgis-viewer")).toHaveCount(0);
        expect(displays).toHaveLength(0);
    });
}

test("relays asynchronous dataset HTTP failures from the real viewer", async ({ page }) => {
    await dataset(page, {}, { displayStatus: 403 });
    const wrapper = await open(page);
    await expect(wrapper.getByRole("alert")).toHaveText("Could not load the dataset (HTTP 403).", { timeout: 100_000 });
});

test("ignores forged viewer messages from another window", async ({ page }) => {
    await dataset(page);
    const wrapper = await open(page);
    await loaded(wrapper);
    await page.evaluate(
        () =>
            new Promise((resolve) => {
                const target = document.querySelector("iframe").contentWindow;
                target.addEventListener("message", () => setTimeout(resolve, 0), { once: true });
                target.postMessage({ rustgis: "load-error", error: "Forged error" }, location.origin);
            }),
    );
    await expect(wrapper.locator("#app")).toHaveAttribute("data-state", "loaded");
    await expect(wrapper.getByRole("alert")).toHaveCount(0);
});

test("ships deferred registration, licenses and relative viewer assets", async ({ request }) => {
    const xml = await (await request.get("/galaxy/visualizations/rustgis/rustgis.xml")).text();
    for (const extension of ["geojson", "las", "laz"]) {
        expect(xml).toContain(`allow_uri_if_protocol="https,http">${extension}</test>`);
    }
    for (const file of ["LICENSE", "THIRD-PARTY-LICENSES.txt"]) {
        expect((await request.get(`/galaxy/visualizations/rustgis/vendor/rustgis/${file}`)).ok()).toBe(true);
    }
    const shell = await (await request.get("/galaxy/visualizations/rustgis/vendor/rustgis/index.html")).text();
    expect(shell).not.toMatch(/googletagmanager|serviceWorker|https:\/\//);
});
