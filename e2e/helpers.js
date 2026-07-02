// Shared actions for the Billdee E2E suite. Kept small on purpose — each
// helper wraps one user-visible action and waits on visible outcomes
// (headers, toasts), never on fixed timeouts.
import { expect } from '@playwright/test';

/** Open the app and wait until the dashboard has rendered. */
export async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('.page-title')).toHaveText('แดชบอร์ด');
}

/** Navigate via the sidebar and wait for the destination page title. */
export async function goTo(page, href, expectedTitle) {
  await page.locator(`a[href="${href}"]`).click();
  await expect(page.locator('.page-title')).toHaveText(expectedTitle);
}

/** Assert a toast containing the given text appears. */
export async function expectToast(page, text) {
  await expect(page.locator('.toast', { hasText: text }).first()).toBeVisible();
}

/** Add a product via the Products modal. stock '' = not tracked. */
export async function addProduct(page, { name, price, stock = '', barcode = '' }) {
  await page.getByRole('button', { name: 'เพิ่มสินค้า', exact: true }).click();
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible();
  // Wait for the auto-generated product code — the form is ready then.
  await expect(modal.locator('input[type="text"]').first()).toHaveValue(/^P-/);
  if (barcode) await modal.locator('input[type="text"]').nth(1).fill(barcode);
  await modal.locator('input[type="text"]').nth(2).fill(name);
  await modal.locator('input[type="number"]').nth(0).fill(String(price));
  if (stock !== '') await modal.locator('input[type="number"]').nth(1).fill(String(stock));
  await modal.getByRole('button', { name: 'เพิ่มสินค้า', exact: true }).click();
  // Success closes the modal and the new row appears (validation failures
  // keep the modal open — a much clearer failure signal than a missed toast).
  await expect(modal).toBeHidden();
  await expect(page.locator('.data-table tbody tr', { hasText: name })).toBeVisible();
}

/** On the create-invoice page: add a free-text line item to the first empty row. */
export async function fillManualItem(page, { description, qty = 1, price, discount }) {
  const row = page.locator('.data-table tbody tr').first();
  await row.locator('input[type="text"]').fill(description);
  await row.locator('input[type="number"]').nth(0).fill(String(qty));
  await row.locator('input[type="number"]').nth(1).fill(String(price));
  if (discount !== undefined) await row.locator('input[type="number"]').nth(2).fill(String(discount));
}

/** Pick a saved product into the bill via the product quick-search. */
export async function pickProduct(page, query) {
  await page.locator('input[placeholder*="ค้นหาสินค้าที่บันทึกไว้"]').fill(query);
  await page.locator('.autocomplete-item').first().click();
}
