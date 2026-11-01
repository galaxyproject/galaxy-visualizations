import { test, expect } from "@playwright/test";

const DATASET = { id: "1", hid: 3, name: "counts", extension: "tabular", history_id: "history1" };
const TABLE = "gene\tsample_a\tsample_b\nA\t10\t12\nB\t20\t18\nC\t5\t9\n";
const STARTUP = { timeout: 90_000 };

async function mockGalaxy(page) {
    const requests = { uploads: [], visualizations: [] };
    await page.route("**/api/datasets/1", (route) => route.fulfill({ json: DATASET }));
    await page.route("**/api/datasets/1/display", (route) => route.fulfill({ status: 200, body: TABLE }));
    await page.route("**/api/tools/fetch", async (route) => {
        requests.uploads.push(route.request().postDataBuffer().toString("latin1"));
        await route.fulfill({ json: { outputs: [] } });
    });
    await page.route("**/api/visualizations**", async (route) => {
        requests.visualizations.push({ method: route.request().method(), body: route.request().postDataJSON() });
        await route.fulfill({ json: { id: "visualization1" } });
    });
    return requests;
}

async function openReady(page) {
    const requests = await mockGalaxy(page);
    await page.goto("/?dataset_id=1");
    await expect(page.locator(".webr-status")).toHaveText("Ready", STARTUP);
    return requests;
}

async function consoleRun(page, code) {
    await page.locator(".webr-console-input").fill(code);
    await page.locator(".webr-console-input").press("Enter");
    await expect(page.locator(".webr-status")).toHaveText("Ready", STARTUP);
}

test("loads the dataset into R and runs the default script", async ({ page }) => {
    await openReady(page);
    await expect(page.locator(".webr-console-log")).toContainText(
        'Dataset 3 "counts" is at /galaxy/input/counts.tabular',
    );
    await expect(page.locator(".webr-editor")).toContainText('read.delim("/galaxy/input/counts.tabular"');
    await page.click(".webr-run-script");
    await expect(page.locator(".webr-status")).toHaveText("Ready", STARTUP);
    await expect(page.locator(".webr-console-log")).toContainText("sample_a");
    await expect(page.locator(".webr-console-log")).toContainText("Max.   :20.00");
    await page.click(".webr-tab-files");
    await expect(page.locator(".webr-file")).toContainText(["/galaxy/input/counts.tabular"]);
});

test("shows R errors, warnings and messages", async ({ page }) => {
    await openReady(page);
    await consoleRun(page, 'message("hello"); warning("careful"); stop("broken")');
    const log = page.locator(".webr-console-log");
    await expect(log.locator(".text-gray-500", { hasText: "hello" })).toHaveCount(1);
    await expect(log.locator(".text-amber-700", { hasText: "careful" })).toHaveCount(1);
    await expect(log.locator(".text-red-700", { hasText: "broken" })).toHaveCount(1);
});

test("captures plots and sends one to the history", async ({ page }) => {
    const requests = await openReady(page);
    await consoleRun(page, "plot(1:10); hist(rnorm(100))");
    await expect(page.locator(".webr-plot-position")).toHaveText("2 / 2");
    const size = await page.locator(".webr-plot").evaluate((image) => image.naturalWidth);
    expect(size).toBeGreaterThan(300);
    await page.click(".webr-plot-save");
    await expect(page.locator(".webr-console-log")).toContainText("Sent plot-2.png to the history.");
    expect(requests.uploads).toHaveLength(1);
    expect(requests.uploads[0]).toContain('name="history_id"\r\n\r\nhistory1');
    expect(requests.uploads[0]).toContain('"name":"plot-2.png","ext":"png"');
    expect(requests.uploads[0]).toContain("\x89PNG");
});

test("sends a file written by R to the history", async ({ page }) => {
    const requests = await openReady(page);
    await consoleRun(page, 'write.csv(data.frame(x = 1:3), "result.csv", row.names = FALSE)');
    await page.click(".webr-tab-files");
    const file = page.locator(".webr-file", { hasText: "/home/web_user/result.csv" });
    await file.locator(".webr-file-save").click();
    await expect(page.locator(".webr-console-log")).toContainText("Sent result.csv to the history.");
    expect(requests.uploads[0]).toContain('"name":"result.csv","ext":"csv"');
    expect(requests.uploads[0]).toContain('"x"\n1\n2\n3');
});

test("saves the script with the visualization", async ({ page }) => {
    const requests = await openReady(page);
    await page.locator(".webr-editor .cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("summary(cars)");
    await page.click(".webr-save-script");
    await expect.poll(() => requests.visualizations.length).toBe(1);
    expect(requests.visualizations[0].method).toBe("POST");
    expect(requests.visualizations[0].body.config.settings.script).toBe("summary(cars)");
    await expect(page.locator(".webr-console-log")).toContainText("Saved the script with this visualization.");
});

test("says when the script could not be saved", async ({ page }) => {
    await mockGalaxy(page);
    await page.route("**/api/visualizations**", (route) =>
        route.fulfill({ status: 403, json: { err_msg: "You must be logged in to save visualizations." } }),
    );
    await page.goto("/?dataset_id=1");
    await expect(page.locator(".webr-status")).toHaveText("Ready", STARTUP);
    await page.click(".webr-save-script");
    await expect(page.locator(".webr-console-log")).toContainText("The script was not saved:");
});

test("restores a saved script", async ({ page }) => {
    await mockGalaxy(page);
    const settings = encodeURIComponent(JSON.stringify({ script: "x <- 41 + 1" }));
    await page.goto(`/?dataset_id=1&settings=${settings}`);
    await expect(page.locator(".webr-status")).toHaveText("Ready", STARTUP);
    await expect(page.locator(".webr-editor")).toContainText("x <- 41 + 1");
});

test("runs the current line with Ctrl/Cmd+Enter", async ({ page }) => {
    await openReady(page);
    await page.locator(".webr-editor .cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("6 * 7");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.locator(".webr-console-log")).toContainText("[1] 42", STARTUP);
});

test("restarts R and clears the workspace", async ({ page }) => {
    await openReady(page);
    await consoleRun(page, "kept <- 1");
    await page.click(".webr-restart");
    await expect(page.locator(".webr-status")).toHaveText("Ready", STARTUP);
    await consoleRun(page, 'exists("kept")');
    await expect(page.locator(".webr-console-log")).toContainText("[1] FALSE");
    await consoleRun(page, "file.exists(galaxy_input)");
    await expect(page.locator(".webr-console-log")).toContainText("[1] TRUE");
});

test("installs a CRAN package from the configured repositories", async ({ page }) => {
    test.setTimeout(600_000);
    await openReady(page);
    await page.click(".webr-tab-packages");
    await page.locator(".webr-packages-input").fill("praise");
    await page.click(".webr-packages-install");
    await expect(page.locator(".webr-status")).toHaveText("Ready", { timeout: 540_000 });
    await expect(page.locator(".webr-package", { hasText: /^praise / })).toHaveCount(1);
    await consoleRun(page, "library(praise); nchar(praise()) > 0");
    await expect(page.locator(".webr-console-log")).toContainText("[1] TRUE");
});
