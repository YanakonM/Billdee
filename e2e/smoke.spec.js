import { test, expect } from '@playwright/test';
import { openApp, goTo } from './helpers.js';

// Smoke: the app boots with a seeded empty DB and every page renders.
test.describe('Smoke — ทุกหน้าเปิดได้', () => {
  test('dashboard โหลดขึ้นพร้อม sidebar และไม่มี uncaught error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await openApp(page);
    await expect(page.locator('.sidebar')).toBeVisible();
    // Single-tab guard must NOT fire for the only tab (regression: web-lock
    // self-deadlock showed "ระบบเปิดอยู่ในแท็บอื่นแล้ว").
    await expect(page.getByText('ระบบเปิดอยู่ในแท็บอื่นแล้ว')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('เมนูทุกหน้าเปิดแล้วขึ้นหัวข้อถูกต้อง', async ({ page }) => {
    await openApp(page);
    await goTo(page, '/create-invoice', 'สร้างใบเสร็จ');
    await goTo(page, '/invoices', 'ประวัติใบเสร็จ');
    await goTo(page, '/quotations', 'ใบเสนอราคา');
    await goTo(page, '/credit-notes', 'ใบลดหนี้ / ใบเพิ่มหนี้');
    await goTo(page, '/customers', 'จัดการลูกค้า');
    await goTo(page, '/products', 'จัดการสินค้า');
    await goTo(page, '/reports', 'รายงาน');
    await goTo(page, '/settings', 'ตั้งค่า');
    await goTo(page, '/', 'แดชบอร์ด');
  });
});
