// @ts-check
import { test, expect } from '@playwright/test';

test('Run plot', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('button').click();
  await page.getByRole('textbox', { name: 'Please Input' }).nth(1).fill('chr1');
  await expect(page.locator('#lz-plot_association_associationpvalues_-161284_TC')).toBeVisible();
  await page.locator('#lz-plot_association_associationpvalues_-161284_TC').click();
  await page.getByText('×phen1:61284_T/C P Value: 4.').click();
  await expect(page.getByText('×phen1:61284_T/C P Value: 4.')).toBeVisible();
  await page.getByRole('button', { name: '×' }).click();
  await expect(page.getByText('×phen1:61284_T/C P Value: 4.')).toBeHidden();
  await page.getByRole('textbox', { name: 'Please Input' }).nth(1).click();
});

