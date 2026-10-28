import { test, expect } from "@playwright/test";
import { archive, warcRecord, hostileHtml } from "./fixtures.js";

async function serveDataset(page, { bytes = archive(), name = "research.warc.gz", state = "ok", status = 200, ranges = true, delayFirst = false } = {}) {
  const requests = [];
  await page.route("**/galaxy/api/datasets/*", route => route.fulfill({ json: { name, state } }));
  await page.route("**/galaxy/api/datasets/*/display", async route => {
    const range = route.request().headers().range;
    requests.push(range || "full");
    if (status !== 200) return route.fulfill({ status, body: "Denied" });
    if (!range) return route.fulfill({
      body: bytes,
      headers: { "Content-Type": "application/gzip", "Content-Length": String(bytes.length), ...(ranges ? { "Accept-Ranges": "bytes" } : {}) },
    });
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range).map(Number);
    if (delayFirst && start === 0) await new Promise(resolve => setTimeout(resolve, 400));
    return route.fulfill({ status: 206, body: bytes.subarray(start, end + 1), headers: {
      "Content-Type": "application/gzip", "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end - start + 1),
    } });
  });
  return requests;
}

/** Exercise the built entry point exactly as Galaxy mounts it in an about:blank iframe. */
async function openViewer(page, { config = { dataset_id: "archive-id" }, visualizationId, title } = {}) {
  await page.goto("/");
  await page.evaluate(({ config, visualizationId, title }) => {
    document.body.replaceChildren();
    document.body.style.cssText = "margin:0;height:100vh";
    window.hostMessages = [];
    window.addEventListener("message", event => {
      if (event.data?.from === "galaxy-visualization") window.hostMessages.push(event.data);
    });
    const frame = document.createElement("iframe");
    frame.id = "galaxy_visualization";
    frame.style.cssText = "width:100%;height:100%;border:0";
    document.body.appendChild(frame);
    const app = frame.contentDocument.createElement("div");
    app.id = "app";
    app.dataset.incoming = JSON.stringify({
      root: `${window.location.origin}/galaxy/`,
      visualization_config: config,
      visualization_id: visualizationId,
      visualization_title: title,
    });
    frame.contentDocument.body.appendChild(app);
    const link = frame.contentDocument.createElement("link");
    link.rel = "stylesheet";
    link.href = `${window.location.origin}/static/index.css`;
    frame.contentDocument.head.appendChild(link);
    const script = frame.contentDocument.createElement("script");
    script.type = "module";
    script.src = `${window.location.origin}/static/index.js`;
    frame.contentDocument.body.appendChild(script);
  }, { config, visualizationId, title });
  return page.frameLocator("#galaxy_visualization");
}

test("loads the history dataset in Galaxy, searches and filters the upstream record list", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const requests = await serveDataset(page, { name: "<img src=x onerror=alert(1)>.warc.gz" });
  const viewer = await openViewer(page);
  await expect(viewer.locator("#currentFileLabel")).toHaveText("3 records");
  await expect(viewer.locator("#fileTree")).toContainText("<img src=x onerror=alert(1)>.warc.gz");
  await expect(viewer.locator("#fileTree img")).toHaveCount(0);
  await viewer.locator(".record-row").first().click();
  await expect(viewer.locator("#headerView")).toHaveValue(/WARC-Type: response/);
  await expect(viewer.locator("#httpHeaderView")).toHaveValue(/HTTP\/1.1 200 OK/);
  await expect(viewer.locator("#payloadView")).toHaveValue("Archived payload 1");
  await page.screenshot({ path: test.info().outputPath("warc-explorer.png") });
  expect(requests[0]).toBe("full");
  expect(requests[1]).toMatch(/^bytes=0-/);
  await viewer.locator("#searchInput").fill("record-2");
  await expect(viewer.locator(".record-row")).toHaveCount(1);
  await viewer.locator(".record-row").click();
  await expect(viewer.locator("#payloadView")).toHaveValue("Archived payload 2");
  await viewer.locator("#searchInput").fill("");
  await expect(viewer.locator(".record-row")).toHaveCount(3);
  await viewer.locator(".chip").filter({ hasText: /^response/ }).click();
  await expect(viewer.locator(".record-row")).toHaveCount(1);
  await expect(viewer.locator(".record-row")).toContainText("metadata");
  expect(errors).toEqual([]);
});

for (const layout of ["plain", "single"]) {
  test(`opens later records from a ${layout} archive`, async ({ page }) => {
    await serveDataset(page, { bytes: archive(undefined, layout) });
    const viewer = await openViewer(page);
    await expect(viewer.locator(".record-row")).toHaveCount(3);
    await viewer.locator(".record-row").nth(2).click();
    await expect(viewer.locator("#payloadView")).toHaveValue("Archived payload 3");
    if (layout === "single") await expect(viewer.locator("#statusLeft")).toContainText("sequential gzip access");
  });
}

test("works when the server does not support range requests", async ({ page }) => {
  const requests = await serveDataset(page, { ranges: false });
  const viewer = await openViewer(page);
  await expect(viewer.locator(".record-row")).toHaveCount(3);
  await viewer.locator(".record-row").nth(2).click();
  await expect(viewer.locator("#payloadView")).toHaveValue("Archived payload 3");
  expect(requests).toEqual(["full"]);
});

test("a slower previous selection cannot overwrite a newer record", async ({ page }) => {
  await serveDataset(page, { delayFirst: true });
  const viewer = await openViewer(page);
  await expect(viewer.locator(".record-row")).toHaveCount(3);
  await viewer.locator(".record-row").first().click();
  await viewer.locator(".record-row").nth(2).click();
  await expect(viewer.locator("#payloadView")).toHaveValue("Archived payload 3");
  await page.waitForTimeout(500);
  await expect(viewer.locator("#payloadView")).toHaveValue("Archived payload 3");
});

test("creates and updates a saved view, and restores its record and filters", async ({ page }) => {
  await serveDataset(page);
  const writes = [];
  await page.route("**/galaxy/api/visualizations{,/*}", async route => {
    writes.push({ method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { id: "saved-id", revision: "revision-id" } });
  });
  const viewer = await openViewer(page, { config: { dataset_id: "archive-id", query: "record-2", types: ["metadata"], recordId: "<urn:uuid:record-2>" } });
  await expect(viewer.locator("#payloadView")).toHaveValue("Archived payload 2");
  await expect(viewer.locator(".record-row")).toHaveCount(1);
  await viewer.locator("#save-view").click();
  await expect(viewer.locator("#save-view")).toHaveText("Saved");
  expect(writes[0].method).toBe("POST");
  expect(writes[0].body.type).toBe("warcexplorer");
  expect(writes[0].body.config).toMatchObject({ dataset_id: "archive-id", query: "record-2", types: ["metadata"], recordId: "<urn:uuid:record-2>" });
  await viewer.locator("#searchInput").fill("absent");
  await expect(viewer.locator(".record-row")).toHaveCount(0);
  await viewer.locator("#save-view").click();
  await expect(viewer.locator("#save-view")).toHaveText("Saved");
  expect(writes[1].method).toBe("PUT");
  expect(writes[1].body.config.query).toBe("absent");
});

test("updates an owned visualization and reports save errors", async ({ page }) => {
  await serveDataset(page);
  const methods = [];
  await page.route("**/galaxy/api/visualizations/existing-id", async route => {
    methods.push(route.request().method());
    await route.fulfill({ status: 403, body: "Forbidden" });
  });
  const viewer = await openViewer(page, { visualizationId: "existing-id" });
  await expect(viewer.locator("#save-view")).toBeEnabled();
  await viewer.locator("#save-view").click();
  await expect(viewer.locator("#galaxy-message")).toContainText("HTTP 403");
  await expect(viewer.locator("#save-view")).toBeEnabled();
  expect(methods).toEqual(["PUT"]);
});

test("renders HTML in a sandbox without scripts, live resources, or an opener", async ({ page }) => {
  const leaked = [];
  await page.context().route("https://live.example/**", async route => {
    leaked.push(route.request().url());
    await route.abort();
  });
  await serveDataset(page, { bytes: archive([warcRecord({ contentType: "text/html", payload: hostileHtml })]) });
  const viewer = await openViewer(page);
  await viewer.locator(".record-row").click();
  await expect(viewer.locator("#payloadView")).toHaveValue(/Archived heading/);
  const popupPromise = page.waitForEvent("popup");
  await viewer.locator("#btnOpenNewTab").click();
  const popup = await popupPromise;
  const preview = popup.frameLocator("iframe");
  await expect(preview.locator("h1")).toHaveText("Archived heading");
  await expect(popup.locator("iframe")).toHaveAttribute("sandbox", "");
  await expect(preview.locator("script,meta[http-equiv=refresh],iframe,form,svg")).toHaveCount(0);
  await expect(preview.locator("a")).not.toHaveAttribute("href");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(await popup.evaluate(() => window.hacked)).toBeUndefined();
  await popup.waitForTimeout(250);
  expect(leaked).toEqual([]);
});

test("previews an image stored as a WARC resource", async ({ page }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  await serveDataset(page, { bytes: archive([warcRecord({ type: "resource", contentType: "image/png", payload: png })]) });
  const viewer = await openViewer(page);
  await viewer.locator(".record-row").click();
  await expect(viewer.locator("#payloadMeta")).toContainText("image/png");
  const popupPromise = page.waitForEvent("popup");
  await viewer.locator("#btnOpenNewTab").click();
  const popup = await popupPromise;
  const img = popup.frameLocator("iframe").locator("img");
  await expect(img).toBeVisible();
  expect(await img.evaluate(element => element.naturalWidth)).toBe(1);
});

for (const [label, fixture, message] of [
  ["an access failure", { status: 403 }, "HTTP 403"],
  ["a pending dataset", { state: "running" }, "not ready"],
  ["invalid input", { bytes: Buffer.from("not a WARC") }, "valid WARC"],
]) {
  test(`reports ${label}`, async ({ page }) => {
    await serveDataset(page, fixture);
    const viewer = await openViewer(page);
    await expect(viewer.locator("#statusLeft")).toContainText(message);
    await expect(viewer.locator("#save-view")).toBeDisabled();
  });
}

test("reports missing dataset configuration", async ({ page }) => {
  const viewer = await openViewer(page, { config: {} });
  await expect(viewer.locator("#galaxy-message")).toContainText("No dataset_id");
});
