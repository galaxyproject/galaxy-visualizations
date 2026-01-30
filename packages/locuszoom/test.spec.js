// @ts-check
import { test, expect } from "@playwright/test";

test("Run plot", async ({ page }) => {
    // Test variables

    const URL = "http://localhost:5173/";
    const CHR_INPUT = "raya560ne.2.1.2"; // a chromosome
    const POINT = "#lz-plot_association_associationpvalues_-RAYA560NE21261284_TC"; // a point in the plot
    const POINT_LOCATOR = page.locator(POINT);
    const PHENO_STAT = "×phenRAYA560NE.2.1.2:61284_T/"; // stats' table for the point
    const PHENO_STAT_TO_CLICK = page.getByText(PHENO_STAT);

    await page.goto(URL);
    await page.getByRole("button").click();
    await page.getByRole("textbox", { name: "Please Input" }).nth(1).fill(CHR_INPUT);
    await expect(POINT_LOCATOR).toBeVisible();
    await POINT_LOCATOR.click();
    await PHENO_STAT_TO_CLICK.click();
    await expect(PHENO_STAT_TO_CLICK).toBeVisible();
    await page.getByRole("button", { name: "×" }).click();
    await expect(PHENO_STAT_TO_CLICK).toBeHidden();
});
