import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, fetchData } from "../compat/fetch-data.js";

const READY = { timeout: 120_000 };

async function currentHistory(request) {
    const response = await request.get("/history/current_history_json");
    return (await response.json()).id;
}

async function upload(request, historyId, name, extension, buffer) {
    const response = await request.post("/api/tools/fetch", {
        multipart: {
            history_id: historyId,
            targets: JSON.stringify([
                { destination: { type: "hdas" }, elements: [{ src: "files", name, ext: extension, dbkey: "?" }] },
            ]),
            "files_0|file_data": { name, mimeType: "application/octet-stream", buffer },
        },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).outputs[0].id;
}

async function waitForDataset(request, historyId, name) {
    let dataset;
    await expect
        .poll(
            async () => {
                const response = await request.get(
                    `/api/histories/${historyId}/contents?v=dev&keys=id,name,state,extension`,
                );
                dataset = (await response.json()).find((item) => item.name === name);
                return dataset?.state;
            },
            { timeout: 180_000, intervals: [1000] },
        )
        .toBe("ok");
    return dataset;
}

function plugin(page) {
    return page.frameLocator("#galaxy_visualization");
}

async function openInR(page, datasetId) {
    await page.goto(`/visualizations/display?visualization=webr&dataset_id=${datasetId}`);
    await expect(plugin(page).locator(".webr-status")).toHaveText("Ready", READY);
}

async function consoleRun(page, code) {
    const frame = plugin(page);
    await frame.locator(".webr-console-input").fill(code);
    await frame.locator(".webr-console-input").press("Enter");
    await expect(frame.locator(".webr-status")).toHaveText("Ready", READY);
}

test.beforeAll(async () => {
    await fetchData();
});

test("opens a history dataset in R and sends results back to the history", async ({ page }) => {
    await page.goto("/");
    const historyId = await currentHistory(page.request);
    const limma = readFileSync(join(DATA_DIR, "limma.tsv"));
    await upload(page.request, historyId, "limma.tsv", "tabular", limma);
    const table = await waitForDataset(page.request, historyId, "limma.tsv");

    await openInR(page, table.id);
    const frame = plugin(page);
    await expect(frame.locator(".webr-console-log")).toContainText('"limma.tsv" is at /galaxy/input/limma.tsv.tabular');
    await frame.locator(".webr-run-script").click();
    await expect(frame.locator(".webr-status")).toHaveText("Ready", READY);
    await expect(frame.locator(".webr-console-log")).toContainText("logFC");

    await consoleRun(page, 'saveRDS(head(data, 50), "subset.rds"); plot(data$logFC, -log10(data$P.Value))');
    await frame.locator(".webr-plot-save").click();
    await expect(frame.locator(".webr-console-log")).toContainText("Sent plot-1.png to the history.");
    await frame.locator(".webr-tab-files").click();
    await frame.locator(".webr-file", { hasText: "/home/web_user/subset.rds" }).locator(".webr-file-save").click();
    await expect(frame.locator(".webr-console-log")).toContainText("Sent subset.rds to the history.");

    const plot = await waitForDataset(page.request, historyId, "plot-1.png");
    expect(plot.extension).toBe("png");
    const subset = await waitForDataset(page.request, historyId, "subset.rds");
    expect(subset.extension).toBe("rds");

    await frame.locator(".webr-save-script").click();
    await expect(frame.locator(".webr-console-log")).toContainText("The script was not saved:");

    await openInR(page, subset.id);
    await expect(plugin(page).locator(".webr-editor")).toContainText("readRDS(");
    await plugin(page).locator(".webr-run-script").click();
    await expect(plugin(page).locator(".webr-status")).toHaveText("Ready", READY);
    await expect(plugin(page).locator(".webr-console-log")).toContainText("Csn1s2b");
});
