import { describe, it, expect, beforeEach, vi } from 'vitest';

// database.js pulls in Dexie/PocketBase/localStorage, none of which exist in the
// node test environment — swap it for an in-memory store with the same API.
const { store } = vi.hoisted(() => ({ store: { products: [], stockLogs: [], nextId: 1 } }));

vi.mock('./database', () => {
  const table = (name) => ({
    async toArray() { return store[name].map(row => ({ ...row })); },
    async add(obj) {
      const id = store.nextId++;
      if (name === 'products' && obj.code && store.products.some(p => p.code === obj.code)) {
        throw new Error('duplicate code'); // mirrors the &code unique index
      }
      store[name].push({ ...obj, id });
      return id;
    },
    async update(id, patch) {
      const row = store[name].find(r => r.id === id);
      if (row) Object.assign(row, patch);
      return row ? 1 : 0;
    },
    async clear() { store[name] = []; },
  });
  return {
    db: { products: table('products'), stockLogs: table('stockLogs') },
    getNextProductCode: async () => {
      const max = store.products.reduce((m, p) => {
        if (!String(p.code || '').startsWith('P-')) return m;
        const n = parseInt(String(p.code).slice(2), 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      return `P-${String(max + 1).padStart(4, '0')}`;
    },
  };
});

const {
  productsToCsv, parseCsv, csvToProducts, parseStockFile, importStock,
} = await import('./stockTransfer.js');

const seed = (products = [], stockLogs = []) => {
  store.products = products.map((p, i) => ({ id: i + 1, ...p }));
  store.stockLogs = stockLogs;
  store.nextId = store.products.length + 1;
};

const fakeFile = (name, text) => ({ name, text: async () => text });

beforeEach(() => seed());

describe('productsToCsv — ส่งออกเป็น CSV', () => {
  it('มีหัวตารางภาษาไทยและข้อมูลครบทุกคอลัมน์', () => {
    const csv = productsToCsv([{ code: 'P-0001', barcode: '885', name: 'ปูน', description: '', category: 'วัสดุ', unit: 'ถุง', costPrice: 100, price: 150, stock: 5 }]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('รหัสสินค้า,บาร์โค้ด,ชื่อสินค้า,รายละเอียด,หมวดหมู่,หน่วย,ราคาทุน,ราคาขาย,คงเหลือ');
    expect(row).toBe('P-0001,885,ปูน,,วัสดุ,ถุง,100,150,5');
  });

  it('ครอบเครื่องหมายคำพูดให้ค่าที่มีลูกน้ำ', () => {
    const csv = productsToCsv([{ name: 'ปูน, ตราเสือ "พิเศษ"', price: 10 }]);
    expect(csv.split('\r\n')[1]).toContain('"ปูน, ตราเสือ ""พิเศษ"""');
  });

  it('stock/ราคาทุน ที่เป็น null ออกเป็นช่องว่าง ไม่ใช่ 0', () => {
    const row = productsToCsv([{ name: 'บริการ', price: 500, costPrice: null, stock: null }]).split('\r\n')[1];
    expect(row).toBe(',,บริการ,,,,,500,');
  });

  it('กันสูตร Excel — ชื่อที่ขึ้นต้นด้วย = ถูก escape', () => {
    expect(productsToCsv([{ name: '=1+1', price: 1 }]).split('\r\n')[1]).toContain("'=1+1");
  });
});

describe('parseCsv / csvToProducts — นำเข้าจาก CSV', () => {
  it('อ่านหัวตารางภาษาไทยและแปลงตัวเลข', () => {
    const rows = csvToProducts('รหัสสินค้า,ชื่อสินค้า,ราคาขาย,คงเหลือ\nP-0001,ปูน,"1,250.50",30');
    expect(rows).toEqual([{ code: 'P-0001', name: 'ปูน', price: 1250.5, stock: 30 }]);
  });

  it('รับหัวตารางภาษาอังกฤษ/ชื่อพ้องได้', () => {
    const rows = csvToProducts('Name,SKU,Price,QTY\nปูน,A1,10,2');
    expect(rows[0]).toEqual({ name: 'ปูน', code: 'A1', price: 10, stock: 2 });
  });

  it('รับตัวคั่น ; ที่ Excel บางเครื่องใช้', () => {
    expect(csvToProducts('ชื่อสินค้า;ราคาขาย\nปูน;10')[0]).toEqual({ name: 'ปูน', price: 10 });
  });

  it('ช่องว่างในคอลัมน์ตัวเลข = null (ไม่ติดตามสต็อค) ไม่ใช่ 0', () => {
    expect(csvToProducts('ชื่อสินค้า,ราคาขาย,คงเหลือ\nบริการ,500,')[0].stock).toBeNull();
  });

  it('ข้ามแถวว่างและแถวที่ไม่มีชื่อสินค้า', () => {
    expect(csvToProducts('ชื่อสินค้า,ราคาขาย\nปูน,10\n\n,20\n')).toHaveLength(1);
  });

  it('ฟ้องเมื่อไม่มีคอลัมน์ชื่อสินค้า', () => {
    expect(() => csvToProducts('รหัส,ราคา\nA,10')).toThrow(/ชื่อสินค้า/);
  });

  it('ไป-กลับ (export → import) ได้ค่าเดิม', () => {
    const original = [{ code: 'P-0001', barcode: '885', name: 'ปูน, ตราเสือ', description: 'ถุง 50 กก.', category: 'วัสดุ', unit: 'ถุง', costPrice: 100, price: 150.25, stock: 7 }];
    expect(csvToProducts(productsToCsv(original))).toEqual(original);
  });

  it('parseCsv รักษาขึ้นบรรทัดใหม่ภายในเครื่องหมายคำพูด', () => {
    expect(parseCsv('a,b\n"บรรทัด1\nบรรทัด2",x')[1][0]).toBe('บรรทัด1\nบรรทัด2');
  });
});

describe('parseStockFile — ตรวจไฟล์ก่อนแตะฐานข้อมูล', () => {
  it('อ่านไฟล์ JSON ของสต็อคได้', async () => {
    const parsed = await parseStockFile(fakeFile('stock.json', JSON.stringify({
      type: 'billdee-stock', products: [{ name: 'ปูน', price: 10 }], stockLogs: [{ productId: 1 }],
    })));
    expect(parsed.format).toBe('json');
    expect(parsed.products).toHaveLength(1);
    expect(parsed.stockLogs).toHaveLength(1);
  });

  it('ดึงสินค้าออกจากไฟล์สำรองทั้งฐานข้อมูลได้ด้วย', async () => {
    const parsed = await parseStockFile(fakeFile('backup.json', JSON.stringify({
      customers: [], invoices: [], products: [{ name: 'ปูน', price: 10 }],
    })));
    expect(parsed.products).toHaveLength(1);
  });

  it('ฟ้องเมื่อไฟล์เสียหายหรือไม่มีสินค้า', async () => {
    await expect(parseStockFile(fakeFile('x.json', 'ไม่ใช่ json'))).rejects.toThrow(/อ่านข้อมูลไม่ได้/);
    await expect(parseStockFile(fakeFile('x.json', '{"customers":[]}'))).rejects.toThrow(/ไม่มีข้อมูลสินค้า/);
  });
});

describe('importStock — เขียนลงเครื่องปลายทาง', () => {
  it('merge: จับคู่ด้วยบาร์โค้ดแล้วอัปเดต ไม่สร้างซ้ำ', async () => {
    seed([{ code: 'P-0001', barcode: '885', name: 'ปูน', price: 100, stock: 5 }]);
    const result = await importStock({ products: [{ barcode: '885', name: 'ปูน', price: 150, stock: 20 }] });
    expect(result).toMatchObject({ added: 0, updated: 1 });
    expect(store.products).toHaveLength(1);
    expect(store.products[0]).toMatchObject({ price: 150, stock: 20 });
  });

  it('merge: จับคู่ด้วยรหัส แล้วด้วยชื่อ เมื่อไม่มีบาร์โค้ด', async () => {
    seed([
      { code: 'P-0001', barcode: '', name: 'ปูน', price: 100 },
      { code: 'P-0002', barcode: '', name: 'สี', price: 200 },
    ]);
    await importStock({ products: [{ code: 'P-0002', name: 'สีน้ำ', price: 250 }, { name: 'ปูน', price: 120 }] });
    expect(store.products).toHaveLength(2);
    expect(store.products.find(p => p.code === 'P-0002')).toMatchObject({ name: 'สีน้ำ', price: 250 });
    expect(store.products.find(p => p.code === 'P-0001')).toMatchObject({ price: 120 });
  });

  it('นำเข้าไฟล์เดิมซ้ำไม่ทำให้เกิดรายการซ้ำ', async () => {
    const file = { products: [{ barcode: '885', name: 'ปูน', price: 100, stock: 5 }] };
    await importStock(file);
    await importStock(file);
    expect(store.products).toHaveLength(1);
  });

  it('รหัสซ้ำกันเองในไฟล์ ถูกออกรหัสใหม่ให้แทนที่จะเขียนทับกัน', async () => {
    const result = await importStock({
      products: [{ code: 'P-0001', name: 'ก', price: 1 }, { code: 'P-0001', name: 'ข', price: 2 }],
    }, { mode: 'replace' });
    expect(result.added).toBe(2);
    expect(store.products.map(p => p.code)).toEqual(['P-0001', 'P-0002']);
  });

  it('สินค้าใหม่ที่ไม่มีรหัสในไฟล์ ได้รหัสอัตโนมัติ', async () => {
    await importStock({ products: [{ name: 'ก' , price: 1 }, { name: 'ข', price: 2 }] });
    expect(store.products.map(p => p.code)).toEqual(['P-0001', 'P-0002']);
  });

  it('ไม่ติ๊ก "อัปเดตจำนวนคงเหลือ" = ราคาเปลี่ยน แต่สต็อคเดิมคงอยู่', async () => {
    seed([{ code: 'P-0001', barcode: '885', name: 'ปูน', price: 100, stock: 5 }]);
    await importStock({ products: [{ barcode: '885', name: 'ปูน', price: 150, stock: 99 }] },
      { updateStockLevels: false });
    expect(store.products[0]).toMatchObject({ price: 150, stock: 5 });
  });

  it('ค่าว่างในไฟล์ไม่ลบข้อมูลเดิมทิ้ง', async () => {
    seed([{ code: 'P-0001', barcode: '885', name: 'ปูน', description: 'ถุง 50 กก.', category: 'วัสดุ', price: 100, stock: 5 }]);
    await importStock({ products: [{ barcode: '885', name: 'ปูน', description: '', category: '', price: 100, stock: null }] });
    expect(store.products[0]).toMatchObject({ description: 'ถุง 50 กก.', category: 'วัสดุ', stock: 5 });
  });

  it('ข้ามแถวที่ไม่มีชื่อสินค้า', async () => {
    const result = await importStock({ products: [{ name: '', price: 1 }, { name: '  ', price: 2 }] });
    expect(result.skipped).toBe(2);
    expect(store.products).toHaveLength(0);
  });

  it('replace: ล้างของเดิมทั้งหมดแล้วใส่ใหม่', async () => {
    seed([{ code: 'P-0001', name: 'เก่า', price: 1 }], [{ id: 1, productId: 1, type: 'sale' }]);
    const result = await importStock({ products: [{ name: 'ใหม่', price: 2 }] }, { mode: 'replace' });
    expect(result).toMatchObject({ added: 1, updated: 0 });
    expect(store.products.map(p => p.name)).toEqual(['ใหม่']);
    expect(store.stockLogs).toHaveLength(0);
  });

  it('replace + includeLogs: ประวัติถูกผูกกับ id ใหม่ของสินค้า', async () => {
    seed([{ code: 'P-0001', name: 'เก่า', price: 1 }]);
    await importStock({
      products: [{ id: 77, name: 'ปูน', price: 2 }],
      stockLogs: [{ id: 5, productId: 77, type: 'receive', quantity: 3 }, { id: 6, productId: 999, type: 'sale' }],
    }, { mode: 'replace', includeLogs: true });
    expect(store.stockLogs).toHaveLength(1); // log ที่หาสินค้าต้นทางไม่เจอถูกทิ้ง
    expect(store.stockLogs[0].productId).toBe(store.products[0].id);
  });

  it('merge ไม่นำประวัติเข้ามาซ้ำ แม้จะสั่ง includeLogs', async () => {
    await importStock({
      products: [{ id: 77, name: 'ปูน', price: 2 }],
      stockLogs: [{ id: 5, productId: 77, type: 'receive', quantity: 3 }],
    }, { mode: 'merge', includeLogs: true });
    expect(store.stockLogs).toHaveLength(0);
  });

  it('รายการที่เขียนไม่สำเร็จถูกรายงานกลับ ไม่ทำให้ทั้งชุดล้ม', async () => {
    seed([{ code: 'P-0001', name: 'เดิม', price: 1 }]);
    const result = await importStock({ products: [{ name: 'ก', price: 1 }, { name: 'ข', price: 2 }] });
    expect(result.added + result.skipped).toBe(2);
    expect(result.errors.length).toBe(result.skipped);
  });
});
