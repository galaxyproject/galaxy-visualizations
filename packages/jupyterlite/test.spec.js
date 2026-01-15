import { test, expect } from "@playwright/test";

const DATASET_0 = {
    id: "dataset_0",
    extension: "txt",
    hid: 99,
    history_content_type: "dataset",
    history_id: "history_id",
    name: "notebook",
};
const DATASET_1 = {
    id: "dataset_1",
    extension: "binary",
    hid: 98,
    history_content_type: "dataset",
    history_id: "history_id",
    name: "sample",
};

const DATASET_HASH = "f1b9ff97-c70c-4889-a0d0-40896db528eb";

const LANDING = "http://localhost:8000/lab/index.html?root=/root/&dataset_id=dataset_0&history_id=history_id";

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

async function startService(page, testTitle = "Hello World!") {
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
                        id: DATASET_HASH,
                        cell_type: "code",
                        source: `print("${testTitle}")`,
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
            body: "content_1",
        });
    });

    await page.route("**/root/api/datasets/dataset_0", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_0),
        });
    });

    await page.route("**/root/history/current_history_json", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "history_id" }),
        });
    });

    await page.route("**/root/api/histories/history_id/contents", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([DATASET_0, DATASET_1]),
        });
    });

    await page.route("**/root/api/histories/history_id/contents?v=dev&q=hid-eq&qv=99", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([DATASET_0]),
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

    await page.route("**/root/api/tools/fetch", async (route) => {
        await route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) });
    });

    // goto landing page
    await page.goto(LANDING);

    // select kernel
    await selectKernel(page);

    // accept and execute first cell
    await page.keyboard.press("Shift+Enter");
    await checkOutputArea(page, 0, testTitle);
}

test("test seaborn", async ({ page }, testInfo) => {
    await startService(page, testInfo.title);
    const seabornCode = [
        "import numpy as np",
        "import pandas as pd",
        "import matplotlib.pyplot as plt",
        "import seaborn as sns",
        "x = np.linspace(0, 10, 100)",
        "y = np.sin(x)",
        'df = pd.DataFrame({"x": x, "y": y})',
        "sns.lineplot(data=df, x='x', y='y')",
        "plt.show()",
    ].join("\n");
    await page.click(".jp-Cell:last-child .jp-InputArea-editor");
    await page.keyboard.type(seabornCode);
    await page.keyboard.press("Shift+Enter");
    await page.waitForSelector(".jp-RenderedImage", { timeout: 20000 });
    const imageCount = await page.locator(".jp-RenderedImage").count();
    expect(imageCount).toBeGreaterThan(0);
});

test("test plotly", async ({ page }, testInfo) => {
    await startService(page, testInfo.title);
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

test("get and put datasets", async ({ page }, testInfo) => {
    await startService(page, testInfo.title);
    await executeNext(page, [
        "import gxy, os",
        "await gxy.get(99)",
        "with open('99.txt.dataset_0.txt') as f:",
        "print(f.read())",
    ]);
    await checkOutputArea(page, 1, DATASET_HASH);
    await executeNext(page, ["import gxy", "print(await gxy.put('99.txt.dataset_0.txt'))"]);
    await checkOutputArea(page, 2, "ok");
});

test("create and run notebook", async ({ page }) => {
    // start
    await startService(page);

    // test gxy environment
    await executeNext(page, ["import gxy", "print(gxy.get_environment())"]);
    await checkOutputArea(page, 1, "{'root': '/root/', 'dataset_id': 'dataset_0', 'history_id': 'history_id'}");

    // test gxy.get_history_id
    await executeNext(page, ["import gxy", "print(await gxy.get_history_id())"]);
    await checkOutputArea(page, 2, "history_id");

    // test gxy front-end multiple hid filter
    await executeNext(page, ["import gxy", "print(await gxy.get([99, 98]))"]);
    await checkOutputArea(page, 3, "['99.txt.dataset_0.txt', '98.binary.dataset_1.dat']");

    // test gxy backend hid filter
    await executeNext(page, ["import gxy", "print(await gxy.get(98))"]);
    await checkOutputArea(page, 4, "98.binary.dataset_1.dat");

    // test gxy client regex filter
    await executeNext(page, ["import gxy", "print(await gxy.get('boo', 'regex'))"]);
    await checkOutputArea(page, 5, "99.txt.dataset_0.txt");

    // test gxy backend tag filter
    await executeNext(page, ["import gxy", "print(await gxy.get('test', 'tag'))"]);
    await checkOutputArea(page, 6, "98.binary.dataset_1.dat");

    // test gxy client id filter
    await executeNext(page, ["import gxy", "print(await gxy.get('dataset_0', 'id'))"]);
    await checkOutputArea(page, 7, "99.txt.dataset_0.txt");
});

test("strip authorization header for galaxy api requests", async ({ page }, testInfo) => {
    let galaxyApiHeaders = null;
    let otherApiHeaders = null;

    // Intercept Galaxy API requests and capture headers
    await page.route("**/root/api/plugins/jupyterlite/**", async (route) => {
        galaxyApiHeaders = route.request().headers();
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
        });
    });

    // Intercept other API requests to verify headers are preserved
    await page.route("**/root/api/other/**", async (route) => {
        otherApiHeaders = route.request().headers();
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
        });
    });

    await startService(page, testInfo.title);

    // Test 1: Fetch to Galaxy API with Authorization header (should be stripped)
    await page.evaluate(async () => {
        await fetch("/root/api/plugins/jupyterlite/test", {
            headers: { Authorization: "Bearer secret-token" },
        });
    });

    // Verify Authorization header was stripped for Galaxy API
    expect(galaxyApiHeaders).not.toBeNull();
    expect(galaxyApiHeaders["authorization"]).toBeUndefined();

    // Test 2: Fetch to other API with Authorization header (should be preserved)
    await page.evaluate(async () => {
        await fetch("/root/api/other/test", {
            headers: { Authorization: "Bearer secret-token" },
        });
    });

    // Verify Authorization header is preserved for non-Galaxy API requests
    expect(otherApiHeaders).not.toBeNull();
    expect(otherApiHeaders["authorization"]).toBe("Bearer secret-token");
});
