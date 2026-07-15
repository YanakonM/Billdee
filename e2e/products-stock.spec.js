import { test, expect } from '@playwright/test';
import { openApp, goTo, addProduct, expectToast } from './helpers.js';

test.describe('สินค้า & สต็อค', () => {
  test('stock เว้นว่าง = ไม่ติดตาม (แสดง "-" ไม่ใช่ "หมด")', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/products', 'จัดการสินค้า');
    await addProduct(page, { name: 'บริการติดตั้ง', price: 500 }); // stock blank
    const row = page.locator('.data-table tbody tr').first();
    await expect(row.locator('td').nth(7)).toHaveText('-');
    await expect(row.locator('.badge-danger')).toHaveCount(0);
  });

  test('แยกราคาทุนและราคาขายในคลังสินค้า', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/products', 'จัดการสินค้า');
    await addProduct(page, { name: 'สีทาผนัง', costPrice: 320, price: 450, stock: 4 });

    const row = page.locator('.data-table tbody tr').first();
    await expect(row.locator('td').nth(4)).toContainText('320.00');
    await expect(row.locator('td').nth(5)).toContainText('450.00');
    await expect(page.getByText('฿1,280.00')).toBeVisible();
    await expect(page.getByText('฿1,800.00')).toBeVisible();
  });

  test('รับสินค้าเข้าผ่าน modal สต็อค + ประวัติบันทึกครบ', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/products', 'จัดการสินค้า');
    await addProduct(page, { name: 'ปูนถุง', price: 120, stock: 10 });

    await page.locator('button[title="รับเข้า/ปรับสต็อค + ประวัติ"]').first().click();
    const modal = page.locator('.modal');
    await expect(modal.getByText('คงเหลือปัจจุบัน')).toBeVisible();
    await expect(modal.getByText('10 ชิ้น')).toBeVisible();

    // รับเข้า +5 → 15
    await modal.locator('input[type="number"]').fill('5');
    await modal.getByRole('button', { name: 'บันทึก' }).click();
    await expectToast(page, 'บันทึกรายการสต็อคแล้ว');
    await expect(modal.getByText('15 ชิ้น')).toBeVisible();
    await expect(modal.locator('.data-table tbody tr').first()).toContainText('รับเข้า');
  });

  test('สินค้าไม่ติดตามสต็อค เริ่มติดตามได้จาก modal', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/products', 'จัดการสินค้า');
    await addProduct(page, { name: 'ค่าแรงช่าง', price: 300 }); // untracked

    await page.locator('button[title="รับเข้า/ปรับสต็อค + ประวัติ"]').first().click();
    const modal = page.locator('.modal');
    await expect(modal.getByText('ไม่ติดตาม', { exact: true })).toBeVisible();
    await modal.locator('input[type="number"]').fill('7');
    await modal.getByRole('button', { name: 'เริ่มติดตาม' }).click();
    await expectToast(page, 'เริ่มติดตามสต็อคแล้ว');
    await expect(modal.getByText('7 ชิ้น')).toBeVisible();
  });
});
