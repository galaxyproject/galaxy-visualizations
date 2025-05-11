import { test, expect } from "@playwright/test";

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

async function selectKernel(page) {
    await page.waitForSelector(".jp-Dialog");
    await page.click('.jp-Dialog button:has-text("Select")');
    await page.waitForSelector(".jp-NotebookPanel");
    await page.click(".jp-InputArea-editor");
}

test("Create new Python notebook from menu and run a cell", async ({ page }) => {
    // mock api
    await page.route("**/root/api/datasets/dataset_id/display", async (route) => {
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
    await page.route("**/root/api/datasets/dataset_id", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ history_id: "history_id" }),
        });
    });

    // start
    await page.goto("http://localhost:8000/lab/index.html?root=/root/&dataset_id=dataset_id");

    // accept and execute first cell
    await selectKernel(page);
    await page.keyboard.press("Shift+Enter");
    await checkOutputArea(page, 0, "Hello World!");

    // test gxy
    const gxyCode = ["import gxy", "print(gxy.get_environment())"].join("\n");
    await page.click(".jp-Cell:last-child .jp-InputArea-editor");
    await page.keyboard.type(gxyCode);
    await page.keyboard.press("Shift+Enter");
    await checkOutputArea(page, 1, "{'root': '/root/', 'dataset_id': 'dataset_id'}");

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
