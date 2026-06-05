import { test, expect } from "@playwright/test";
import fs from "fs";

const JSON_CONTENT = fs.readFileSync("./test-data/test.json", "utf-8");
const YAML_CONTENT = fs.readFileSync("./test-data/test.yaml", "utf-8");
const JSONLD_CONTENT = fs.readFileSync("./test-data/test.jsonld", "utf-8");

const TEST_URLS = {
    json: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.json",
    yaml: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.yaml",
    jsonld: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.jsonld",
};

test("json viewer", async ({ page }) => {
    await page.route(TEST_URLS.json, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON_CONTENT,
        });
    });

    await page.goto("http://localhost:5173/?format=json");
    await page.waitForSelector(".jse-main", { timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("json.png", { maxDiffPixelRatio: 0.05 });
});

test("yaml viewer", async ({ page }) => {
    await page.route(TEST_URLS.yaml, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/yaml",
            body: YAML_CONTENT,
        });
    });

    await page.goto("http://localhost:5173/?format=yaml");
    await page.waitForSelector(".jse-main", { timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("yaml.png", { maxDiffPixelRatio: 0.05 });
});

test("json-ld viewer", async ({ page }) => {
    await page.route(TEST_URLS.jsonld, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/ld+json",
            body: JSONLD_CONTENT,
        });
    });

    await page.goto("http://localhost:5173/?format=jsonld");
    await page.waitForSelector(".jse-main", { timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("jsonld.png", { maxDiffPixelRatio: 0.05 });
});
