import { describe, it, expect } from 'vitest';
import { searchProducts, filterProducts, scoreProduct } from './productSearch.js';

const products = [
  { id: 1, code: 'P-0001', barcode: '8850001', name: 'ปูนซีเมนต์ ตราเสือ', category: 'วัสดุก่อสร้าง', price: 150, stock: 40, updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, code: 'P-0002', barcode: '8850002', name: 'ปูนขาว', category: 'วัสดุก่อสร้าง', price: 60, stock: 0, updatedAt: '2026-02-01T00:00:00.000Z' },
  { id: 3, code: 'P-0003', barcode: 'AB1234', name: 'สีน้ำ TOA เบอร์ 5', description: 'ใช้กับปูนซีเมนต์ได้', category: 'สี', price: 900, stock: 3, updatedAt: '2026-03-01T00:00:00.000Z' },
  { id: 4, code: 'P-0010', barcode: '', name: 'ค่าแรงติดตั้ง', category: 'บริการ', price: 500, stock: null, updatedAt: '2026-04-01T00:00:00.000Z' },
];

const names = (list) => list.map(p => p.name);

describe('searchProducts — จัดอันดับผลค้นหาสินค้า', () => {
  it('พิมพ์ตัวอักษรแรกก็เจอทันที', () => {
    expect(names(searchProducts(products, 'ป'))).toContain('ปูนขาว');
    expect(searchProducts(products, 'ป').length).toBeGreaterThan(0);
  });

  it('ชื่อที่ขึ้นต้นด้วยคำค้นมาก่อนชื่อที่แค่มีคำนั้นอยู่ข้างใน', () => {
    const result = searchProducts(products, 'ปูนซีเมนต์');
    // #1 ขึ้นต้นด้วย "ปูนซีเมนต์", #3 มีคำนี้แค่ในรายละเอียด
    expect(result[0].id).toBe(1);
  });

  it('รหัสสินค้าตรงเป๊ะชนะทุกอย่าง', () => {
    expect(searchProducts(products, 'p-0003')[0].id).toBe(3);
  });

  it('บาร์โค้ดค้นได้แบบไม่สนตัวพิมพ์เล็กใหญ่ (ของเดิม case-sensitive)', () => {
    expect(searchProducts(products, 'ab1234')[0].id).toBe(3);
    expect(searchProducts(products, 'AB1234')[0].id).toBe(3);
  });

  it('ข้ามขีดคั่นได้ — "p0001" เจอ "P-0001"', () => {
    expect(searchProducts(products, 'p0001')[0].id).toBe(1);
  });

  it('หลายคำต้องตรงทุกคำ (AND)', () => {
    expect(names(searchProducts(products, 'ปูน ตราเสือ'))).toEqual(['ปูนซีเมนต์ ตราเสือ']);
    expect(searchProducts(products, 'ปูน ไม่มีคำนี้')).toEqual([]);
  });

  it('ค้นด้วยหมวดหมู่ได้', () => {
    expect(names(searchProducts(products, 'บริการ'))).toEqual(['ค่าแรงติดตั้ง']);
  });

  it('สินค้าสต็อคหมดถูกดันลงไปอยู่ท้ายผลที่คะแนนใกล้กัน', () => {
    // #1 กับ #2 ขึ้นต้นด้วย "ปูน" เหมือนกัน — ถ้าไม่มีบทลงโทษของหมด #2 ("ปูนขาว"
    // ชื่อสั้นกว่า) จะชนะการตัดสินเสมอ #3 มีคำนี้แค่ในรายละเอียดจึงอยู่ท้ายสุด
    expect(searchProducts(products, 'ปูน').map(p => p.id)).toEqual([1, 2, 3]);
  });

  it('สินค้าที่ไม่ติดตามสต็อค (stock = null) ไม่ถูกนับว่าของหมด', () => {
    expect(scoreProduct(products[3], 'ค่าแรง')).toBeGreaterThan(scoreProduct(products[1], 'ปูนขาว') - 1000);
    expect(searchProducts(products, 'ค่าแรง')[0].id).toBe(4);
  });

  it('พิมพ์ผิด/ตกตัวอักษรยังพอเจอ (subsequence)', () => {
    expect(searchProducts(products, 'ปนขาว')[0].id).toBe(2);
  });

  it('คำค้นว่างคืนสินค้าที่แก้ไขล่าสุดก่อน', () => {
    expect(searchProducts(products, '').map(p => p.id)).toEqual([4, 3, 2, 1]);
  });

  it('จำกัดจำนวนผลลัพธ์ตาม limit', () => {
    expect(searchProducts(products, '', { limit: 2 })).toHaveLength(2);
    expect(searchProducts(products, 'ปูน', { limit: 1 })).toHaveLength(1);
  });

  it('ไม่พังเมื่อสินค้ามีฟิลด์ว่าง/ไม่มีข้อมูล', () => {
    expect(searchProducts([{ id: 9 }, null && {}].filter(Boolean), 'x')).toEqual([]);
    expect(searchProducts(undefined, 'x')).toEqual([]);
  });
});

describe('filterProducts — ใช้กับตารางจัดการสินค้า', () => {
  it('คำค้นว่าง = แสดงทั้งหมด (ไม่ใช่แค่ล่าสุด)', () => {
    expect(filterProducts(products, '')).toHaveLength(4);
    expect(filterProducts(products, '   ')).toHaveLength(4);
  });

  it('ไม่จำกัดจำนวนผลลัพธ์', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `สินค้า ${i}`, price: 1 }));
    expect(filterProducts(many, 'สินค้า')).toHaveLength(50);
  });
});
