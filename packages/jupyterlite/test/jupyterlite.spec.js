const { test, expect } = require("@playwright/test");

test("Create new Python notebook from menu and run a cell", async ({ page }) => {
    await page.goto("http://localhost:8000");

    // Wait for JupyterLab main interface to load
    await page.waitForSelector("#jp-MainMenu");

    // Open the "File" menu
    await page.click("text=File");

    // Click "New" → "Notebook"
    const newItem = page.locator('li.lm-Menu-item[data-type="submenu"]', { hasText: "New" });
    await newItem.waitFor();
    await newItem.hover();

    // Precise match using data-command
    const notebookItem = page.locator('.lm-Menu-item[data-command="notebook:create-new"]');
    await notebookItem.waitFor();
    await notebookItem.click();

    // Wait for the kernel selection dialog
    await page.waitForSelector(".jp-Dialog");

    // Select Python kernel (assumes only one option)
    await page.click('.jp-Dialog button:has-text("Select")');

    // Wait for the notebook to appear
    await page.waitForSelector(".jp-NotebookPanel");

    // Focus the first code cell
    await page.click(".jp-InputArea-editor");

    // Type and execute Python code
    await page.keyboard.type('print("hello world")');
    await page.keyboard.press("Shift+Enter");

    // Wait for output and verify
    await page.waitForSelector(".jp-OutputArea-output");
    await expect(page.locator(".jp-OutputArea-output")).toContainText("hello world");

    // Define the multi-line Plotly + NumPy + Pandas code
    const plotlyCode = [
        'import plotly.express as px',
        'import numpy as np',
        'import pandas as pd',
        'x = np.linspace(0, 10, 100)',
        'y = np.sin(x)',
        'df = pd.DataFrame({"x": x, "y": y})',
        'fig = px.line(df, x="x", y="y", title="Sine Wave")',
        'fig.show()'
      ].join('\n');

    // Focus new cell and paste code
    await page.click(".jp-Cell:last-child .jp-InputArea-editor");
    await page.keyboard.type(plotlyCode, { delay: 5 });
    await page.keyboard.press("Shift+Enter");

    // Wait for plotly plot to render
    await page.waitForSelector(".js-plotly-plot", { timeout: 20000 });

    // Optional: Verify something about the output div
    const plotCount = await page.locator(".js-plotly-plot").count();
    expect(plotCount).toBeGreaterThan(0);
});
