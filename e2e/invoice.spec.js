import { test, expect } from '@playwright/test';
import { openApp, goTo, fillManualItem, expectToast } from './helpers.js';

test.describe('สร้างใบเสร็จ', () => {
  test('บันทึกใบเสร็จแรก → เลข INV-000001 โผล่ในประวัติ', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/create-invoice', 'สร้างใบเสร็จ');
    await fillManualItem(page, { description: 'ค่าบริการทั่วไป', price: 250 });
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expectToast(page, 'บันทึกใบเสร็จสำเร็จ');

    await expect(page.locator('.page-title')).toHaveText('ประวัติใบเสร็จ');
    const row = page.locator('.data-table tbody tr').first();
    await expect(row).toContainText('INV-000001');
    await expect(row).toContainText('250.00');
  });

  test('พิมพ์เลขที่ซ้ำเอง → ถูกบล็อก', async ({ page }) => {
    await openApp(page);
    // ใบแรก (เลขอัตโนมัติ INV-000001)
    await goTo(page, '/create-invoice', 'สร้างใบเสร็จ');
    await fillManualItem(page, { description: 'งานที่หนึ่ง', price: 100 });
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expectToast(page, 'บันทึกใบเสร็จสำเร็จ');

    // ใบที่สอง พิมพ์เลขซ้ำ
    await goTo(page, '/create-invoice', 'สร้างใบเสร็จ');
    await page.locator('input.form-input[style*="font-weight"]').first().fill('INV-000001');
    await fillManualItem(page, { description: 'งานที่สอง', price: 200 });
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expectToast(page, 'ถูกใช้ไปแล้ว');
  });

  test('ส่วนลดเกินยอดของแถว → ถูกบล็อกพร้อมชื่อรายการ', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/create-invoice', 'สร้างใบเสร็จ');
    await fillManualItem(page, { description: 'สินค้าลดเกิน', price: 100, discount: 500 });
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expectToast(page, 'มากกว่ายอดของรายการ');
  });

  test('ใบกำกับภาษีถูกบล็อกจนกว่าเลขภาษีบริษัทจะถูกต้อง', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/create-invoice', 'สร้างใบเสร็จ');
    await fillManualItem(page, { description: 'งานมี VAT', price: 107 });
    // เปลี่ยนประเภทเป็นใบกำกับภาษี (ค่า default บริษัทยังไม่มีเลขภาษี)
    await page.locator('select').filter({ has: page.locator('option[value="tax_invoice"]') })
      .selectOption('tax_invoice');
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expectToast(page, 'กรุณากรอกเลขผู้เสียภาษีของบริษัท');
  });
});
