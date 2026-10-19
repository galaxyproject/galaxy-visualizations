import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DISPLAY_URL = /\/api\/datasets\/[^/]+\/display\?preview=true$/;
const SAMPLE = readFileSync(join(__dirname, "test-data", "1.md"), "utf-8");

function serve(page, options = {}) {
    return page.route(DISPLAY_URL, (route) =>
        route.fulfill({ status: 200, contentType: "text/plain", body: SAMPLE, ...options }),
    );
}

test("renders the markdown", async ({ page }) => {
    await serve(page);
    await page.goto("/?dataset_id=1");
    const content = page.locator("#markdown-content");
    await expect(content.getByRole("heading", { level: 1 })).toHaveText("RNA-seq analysis report");
    await expect(content.getByRole("heading", { level: 2 })).toHaveText(["Steps", "Results"]);
    await expect(content.locator("ol > li")).toHaveCount(3);
    await expect(content.locator("table tbody tr")).toHaveCount(2);
    await expect(content.locator("pre code")).toContainText("import pandas as pd");
    await expect(content.locator("blockquote")).toContainText("adjusted p-value");
    await expect(content).not.toHaveAttribute("aria-busy");
    await expect(page.locator("#markdown-status")).toBeHidden();
    await expect(page.locator("#markdown-error")).toBeHidden();
    await expect(page.locator("#markdown-truncated")).toBeHidden();
});

test("opens links outside the visualization", async ({ page }) => {
    await serve(page);
    await page.goto("/?dataset_id=1");
    const link = page.getByRole("link", { name: "the Galaxy Training Network" });
    await expect(link).toHaveAttribute("href", "https://training.galaxyproject.org");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByRole("link", { name: "https://usegalaxy.org" })).toHaveAttribute("target", "_blank");
});

test("shows raw HTML as text and runs no scripts", async ({ page }) => {
    await serve(page);
    await page.goto("/?dataset_id=1");
    const content = page.locator("#markdown-content");
    await expect(content).toContainText("<script>window.markdownInjected = true;</script>");
    await expect(content.locator("script, img[onerror], [onerror]")).toHaveCount(0);
    await expect(content.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(content).toContainText("[Unsafe link](javascript:");
    expect(await page.evaluate(() => window.markdownInjected)).toBeUndefined();
});

test("notes a truncated preview", async ({ page }) => {
    await serve(page, { headers: { "x-content-truncated": "1000000" } });
    await page.goto("/?dataset_id=large");
    await expect(page.locator("#markdown-truncated")).toHaveText(
        "This dataset is large, so only the first 1.0 MB are shown.",
    );
    await expect(page.locator("#markdown-content h1")).toHaveText("RNA-seq analysis report");
});

test("reports an empty dataset", async ({ page }) => {
    await serve(page, { body: "\n" });
    await page.goto("/?dataset_id=empty");
    await expect(page.locator("#markdown-status")).toHaveText("This dataset is empty.");
    await expect(page.locator("#markdown-error")).toBeHidden();
});

test("reports a failed fetch", async ({ page }) => {
    await page.route(DISPLAY_URL, (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/?dataset_id=missing");
    await expect(page.locator("#markdown-error")).toContainText("Could not fetch dataset: HTTP 404");
    await expect(page.locator("#markdown-status")).toBeHidden();
});

test("encodes the dataset id in the request path", async ({ page }) => {
    const requests = [];
    await page.route("**/api/**", (route) => {
        requests.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 200, contentType: "text/plain", body: SAMPLE });
    });
    await page.goto("/?dataset_id=" + encodeURIComponent("../../users/current"));
    await expect(page.locator("#markdown-content h1")).toHaveText("RNA-seq analysis report");
    expect(requests).toEqual(["/api/datasets/..%2F..%2Fusers%2Fcurrent/display"]);
});

test("keeps remote images from leaking the referrer", async ({ page }) => {
    await serve(page, { body: "![chart](https://images.example.com/chart.png)\n" });
    await page.route("https://images.example.com/**", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/?dataset_id=1");
    const image = page.locator("#markdown-content img");
    await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(image).toHaveAttribute("loading", "lazy");
});
