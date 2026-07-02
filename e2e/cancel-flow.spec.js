import { test, expect } from '@playwright/test';
import { openApp, goTo, addProduct, pickProduct, expectToast } from './helpers.js';

// ยกเลิกเอกสาร (void) แทนการลบ: สต็อคต้องถูกคืน, badge เปลี่ยน,
// ปุ่มลบถาวรโผล่หลังยกเลิกเท่านั้น
test('ขายตัดสต็อค → ยกเลิกบิล → สต็อคคืน + สถานะยกเลิก', async ({ page }) => {
  await openApp(page);

  // เตรียมสินค้ามีสต็อค 10
  await goTo(page, '/products', 'จัดการสินค้า');
  await addProduct(page, { name: 'ทรายถุง', price: 80, stock: 10 });

  // ขาย 2 ชิ้น
  await goTo(page, '/create-invoice', 'สร้างใบเสร็จ');
  await pickProduct(page, 'ทราย');
  await page.locator('.data-table tbody tr').first()
    .locator('input[type="number"]').nth(0).fill('2');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expectToast(page, 'บันทึกใบเสร็จสำเร็จ');

  // สต็อคเหลือ 8
  await goTo(page, '/products', 'จัดการสินค้า');
  await expect(page.locator('.data-table tbody tr').first().locator('td').nth(6))
    .toContainText('8');

  // ยกเลิกบิล (ปุ่มยืนยันใน dialog ชื่อ "ยกเลิกเอกสาร" พอดี — ต้อง exact
  // ไม่งั้นชนกับปุ่มไอคอนในแถวที่ title ขึ้นต้นเหมือนกัน)
  await goTo(page, '/invoices', 'ประวัติใบเสร็จ');
  await page.locator('button[title*="ยกเลิกเอกสาร"]').first().click();
  await page.getByRole('button', { name: 'ยกเลิกเอกสาร', exact: true }).click();
  await expectToast(page, 'คืนสต็อคเรียบร้อย');

  const row = page.locator('.data-table tbody tr').first();
  await expect(row.locator('.badge-danger')).toContainText('ยกเลิก');
  await expect(row.locator('button[title="ลบถาวร"]')).toBeVisible();
  await expect(row.locator('button[title="แก้ไข"]')).toHaveCount(0);

  // สต็อคกลับเป็น 10
  await goTo(page, '/products', 'จัดการสินค้า');
  await expect(page.locator('.data-table tbody tr').first().locator('td').nth(6))
    .toContainText('10');
});
