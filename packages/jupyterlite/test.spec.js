import { test, expect } from "@playwright/test";

const DATASET_0 = { id: "dataset_0", hid: 99, history_content_type: "dataset", history_id: "history_id", name: "notebook" };
const DATASET_1 = { id: "dataset_1", hid: 98, history_content_type: "dataset", history_id: "history_id", name: "sample" };

async function createNotebook(page) {
    await page.waitForSelector("#jp-MainMenu");
    await page.click("text=File");
    const newItem = page.locator('li.lm-Menu-item[data-type="submenu"]', { hasText: "New" });
    await newItem.waitFor();
    await newItem.hover();
    const notebookItem = page.locator('.lm-Menu-item[data-command="notebook:create-new"]');
    await notebookItem.waitFor();
    await notebookItem.click();
}

async function checkOutputArea(page, index, contains) {
    const outputs = page.locator(".jp-OutputArea-output");
    await outputs.nth(index).waitFor();
    await expect(outputs.nth(index)).toContainText(contains);
}

async function executeNext(page, lines) {
    await page.click(".jp-Cell:last-child .jp-InputArea-editor");
    await page.keyboard.type(lines.join("\n"));
    await page.keyboard.press("Shift+Enter");
}

async function selectKernel(page) {
    await page.waitForSelector(".jp-Dialog");
    await page.click('.jp-Dialog button:has-text("Select")');
    await page.waitForSelector(".jp-NotebookPanel");
    await page.click(".jp-InputArea-editor");
}

test("Create new Python notebook from menu and run a cell", async ({ page }) => {
    // mock api
    await page.route("**/root/api/datasets/dataset_0/display", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                metadata: {
                    kernelspec: {
                        name: "",
                        display_name: "",
                    },
                    language_info: {
                        name: "",
                    },
                },
                nbformat_minor: 5,
                nbformat: 4,
                cells: [
                    {
                        id: "f1b9ff97-c70c-4889-a0d0-40896db528eb",
                        cell_type: "code",
                        source: 'print("Hello World!")',
                        metadata: {
                            trusted: true,
                        },
                        outputs: [],
                        execution_count: null,
                    },
                ],
            }),
        });
    });

    await page.route("**/root/api/datasets/dataset_1/display", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "content_1"
        });
    });

    await page.route("**/root/api/datasets/dataset_0", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_0),
        });
    });

    await page.route("**/root/api/histories/history_id/contents", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([DATASET_0, DATASET_1]),
        });
    });

    await page.route("**/root/api/histories/history_id/contents?v=dev&q=hid-eq&qv=98", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([DATASET_1]),
        });
    });

    await page.route("**/root/api/histories/history_id/contents?v=dev&q=tag-eq&qv=test", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([DATASET_1]),
        });
    });

    // start
    await page.goto("http://localhost:8000/lab/index.html?root=/root/&dataset_id=dataset_0");

    // accept and execute first cell
    await selectKernel(page);
    await page.keyboard.press("Shift+Enter");
    await checkOutputArea(page, 0, "Hello World!");

    // test gxy environment
    await executeNext(page, ["import gxy", "print(gxy.get_environment())"]);
    await checkOutputArea(page, 1, "{'root': '/root/', 'dataset_id': 'dataset_0'}");

    // test gxy.get_history_id
    await executeNext(page, ["import gxy", "print(await gxy.get_history_id())"]);
    await checkOutputArea(page, 2, "history_id");

    // test gxy front-end multiple hid filter
    await executeNext(page, ["import gxy", "print(await gxy.get([99, 98]))"]);
    await checkOutputArea(page, 3, "['/history_id/dataset_0', '/history_id/dataset_1']");

    // test gxy backend hid filter
    await executeNext(page, ["import gxy", "print(await gxy.get(98))"]);
    await checkOutputArea(page, 4, "/history_id/dataset_1");

    // test gxy client regex filter
    await executeNext(page, ["import gxy", "print(await gxy.get('boo', 'regex'))"]);
    await checkOutputArea(page, 5, "/history_id/dataset_0");

    // test gxy backend tag filter
    await executeNext(page, ["import gxy", "print(await gxy.get('test', 'tag'))"]);
    await checkOutputArea(page, 6, "/history_id/dataset_1");

    // test plotly, numpy and pandas
    const plotlyCode = [
        "import plotly.express as px",
        "import numpy as np",
        "import pandas as pd",
        "x = np.linspace(0, 10, 100)",
        "y = np.sin(x)",
        'df = pd.DataFrame({"x": x, "y": y})',
        'fig = px.line(df, x="x", y="y", title="Sine Wave")',
        "fig.show()",
    ].join("\n");
    await page.click(".jp-Cell:last-child .jp-InputArea-editor");
    await page.keyboard.type(plotlyCode);
    await page.keyboard.press("Shift+Enter");
    await page.waitForSelector(".js-plotly-plot", { timeout: 20000 });
    const plotCount = await page.locator(".js-plotly-plot").count();
    expect(plotCount).toBeGreaterThan(0);
});
