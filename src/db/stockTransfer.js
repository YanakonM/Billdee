// Move the product/stock catalogue between machines.
//
// The whole-database backup in database.js is all-or-nothing: restoring it on
// another machine also overwrites that machine's customers and invoices. This
// module moves ONLY สินค้า/สต็อค, in two formats:
//
//   JSON  — lossless (every field + optional movement history). Use this to
//           copy the catalogue to a second machine.
//   CSV   — opens in Excel, so the list can be edited in bulk and imported
//           back. UTF-8 BOM so Thai is not mojibake in Excel.
//
// Import never blindly appends: rows are matched to existing products by
// barcode → code → name, so importing the same file twice updates instead of
// creating duplicates.

import { db, getNextProductCode } from './database';

export const STOCK_FILE_TYPE = 'billdee-stock';
export const STOCK_FILE_VERSION = 1;

// CSV layout. `aliases` lets a hand-edited or foreign file still import: header
// matching is case-insensitive and ignores spaces.
const COLUMNS = [
  { key: 'code',        header: 'รหัสสินค้า', aliases: ['รหัส', 'code', 'sku', 'productcode'] },
  { key: 'barcode',     header: 'บาร์โค้ด',   aliases: ['barcode', 'ean', 'upc'] },
  { key: 'name',        header: 'ชื่อสินค้า',  aliases: ['ชื่อ', 'name', 'product', 'productname'] },
  { key: 'description', header: 'รายละเอียด',  aliases: ['description', 'desc', 'detail'] },
  { key: 'category',    header: 'หมวดหมู่',    aliases: ['หมวด', 'category', 'group'] },
  { key: 'unit',        header: 'หน่วย',      aliases: ['unit', 'uom'] },
  { key: 'costPrice',   header: 'ราคาทุน',    aliases: ['ทุน', 'cost', 'costprice'] },
  { key: 'price',       header: 'ราคาขาย',    aliases: ['ราคา', 'price', 'saleprice', 'sellprice'] },
  { key: 'stock',       header: 'คงเหลือ',    aliases: ['สต็อค', 'สต็อก', 'จำนวน', 'จำนวนคงเหลือ', 'stock', 'qty', 'quantity'] },
];

const NUMERIC_KEYS = new Set(['costPrice', 'price', 'stock']);

// ============================================================
// CSV helpers
// ============================================================

function csvCell(value) {
  const text = value == null ? '' : String(value);
  // Excel reads a leading =, +, - or @ as a formula. Prefix with ' so a product
  // name like "-A4" stays text instead of becoming #NAME?.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function productsToCsv(products) {
  const lines = [COLUMNS.map(c => csvCell(c.header)).join(',')];
  for (const p of products) {
    lines.push(COLUMNS.map(c => {
      const value = p[c.key];
      // Blank stock/cost means "not tracked" / "unknown" — keep it blank so a
      // round-trip does not silently turn it into 0.
      if (value == null) return '';
      return csvCell(value);
    }).join(','));
  }
  return lines.join('\r\n');
}

// Minimal RFC-4180 parser: quoted fields, escaped quotes, CRLF, and the
// semicolon delimiter Excel uses in some locales.
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  if (!clean.trim()) return [];

  const headerLine = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter = (headerLine.split(';').length > headerLine.split(',').length) ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  row.push(field);
  rows.push(row);

  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

const headerKey = (text) => String(text ?? '').replace(/\s+/g, '').replace(/^'/, '').toLowerCase();

function columnForHeader(header) {
  const key = headerKey(header);
  if (!key) return null;
  return COLUMNS.find(c => headerKey(c.header) === key || c.aliases.some(a => headerKey(a) === key)) || null;
}

// "1,234.50", "฿1,234", " 12 " → numbers. '' / '-' → null (= not set).
function parseNumber(value) {
  if (value == null) return null;
  const text = String(value).replace(/[฿,\s]/g, '').replace(/^'/, '');
  if (text === '' || text === '-') return null;
  const n = Number(text);
  return isNaN(n) ? null : n;
}

export function csvToProducts(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  const mapping = rows[0].map(columnForHeader);
  if (!mapping.some(c => c && c.key === 'name')) {
    throw new Error('ไม่พบคอลัมน์ "ชื่อสินค้า" ในไฟล์ CSV');
  }

  return rows.slice(1).map(cells => {
    const product = {};
    mapping.forEach((column, i) => {
      if (!column) return;
      const raw = cells[i] == null ? '' : String(cells[i]).replace(/^'/, '').trim();
      if (NUMERIC_KEYS.has(column.key)) product[column.key] = parseNumber(raw);
      else product[column.key] = raw;
    });
    return product;
  }).filter(p => String(p.name || '').trim() !== '');
}

// ============================================================
// Export
// ============================================================

function downloadFile(content, fileName, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().split('T')[0];

/** Build the JSON payload (also used by tests and by the CSV path). */
export async function getStockExportData({ includeLogs = true } = {}) {
  const products = await db.products.toArray();
  const data = {
    type: STOCK_FILE_TYPE,
    version: STOCK_FILE_VERSION,
    exportDate: new Date().toISOString(),
    productCount: products.length,
    products,
  };
  if (includeLogs) {
    try { data.stockLogs = await db.stockLogs.toArray(); } catch { data.stockLogs = []; }
  }
  return data;
}

export async function exportStockJson({ includeLogs = true } = {}) {
  const data = await getStockExportData({ includeLogs });
  downloadFile(JSON.stringify(data, null, 2), `billdee-stock-${today()}.json`, 'application/json');
  return data.productCount;
}

export async function exportStockCsv() {
  const products = await db.products.toArray();
  // BOM first — without it Excel opens UTF-8 Thai as garbage.
  downloadFile('﻿' + productsToCsv(products), `billdee-stock-${today()}.csv`, 'text/csv;charset=utf-8;');
  return products.length;
}

// ============================================================
// Import
// ============================================================

/**
 * Read a .json or .csv file into `{ products, stockLogs }` without touching
 * the database, so a bad file can be rejected before anything changes.
 */
export async function parseStockFile(file) {
  const text = await file.text();
  const isCsv = /\.csv$/i.test(file.name) || (!/\.json$/i.test(file.name) && !text.trim().startsWith('{'));

  if (isCsv) {
    const products = csvToProducts(text);
    if (!products.length) throw new Error('ไม่พบรายการสินค้าในไฟล์ CSV');
    return { format: 'csv', products, stockLogs: [] };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('ไฟล์เสียหาย — อ่านข้อมูลไม่ได้');
  }
  // Accept both a stock-only export and a full Billdee backup, so the user can
  // pull the catalogue out of an old whole-database backup file too.
  const products = Array.isArray(data?.products) ? data.products : null;
  if (!products) throw new Error('ไฟล์นี้ไม่มีข้อมูลสินค้า');
  if (!products.length) throw new Error('ไฟล์นี้ไม่มีรายการสินค้า');

  return {
    format: 'json',
    products,
    stockLogs: Array.isArray(data.stockLogs) ? data.stockLogs : [],
    exportDate: data.exportDate || null,
  };
}

const norm = (v) => String(v ?? '').trim().toLowerCase();

// Match an incoming row to an existing product. Barcode is the strongest
// signal (it is what the scanner reads), then the code, then the exact name.
function findExisting(incoming, existing) {
  const barcode = norm(incoming.barcode);
  if (barcode) {
    const hit = existing.find(p => norm(p.barcode) === barcode);
    if (hit) return hit;
  }
  const code = norm(incoming.code);
  if (code) {
    const hit = existing.find(p => norm(p.code) === code);
    if (hit) return hit;
  }
  const name = norm(incoming.name);
  if (name) {
    const hit = existing.find(p => norm(p.name) === name);
    if (hit) return hit;
  }
  return null;
}

// Only overwrite a field when the incoming file actually carries a value —
// a CSV with an empty รายละเอียด column must not blank out existing details.
function mergeFields(existing, incoming, { updateStockLevels }) {
  const patch = {};
  for (const key of ['name', 'barcode', 'description', 'category', 'unit']) {
    const value = incoming[key];
    if (value != null && String(value).trim() !== '' && String(value) !== String(existing[key] ?? '')) {
      patch[key] = String(value).trim();
    }
  }
  for (const key of ['price', 'costPrice']) {
    const value = incoming[key] == null || incoming[key] === '' ? null : Number(incoming[key]);
    if (value != null && !isNaN(value) && value !== existing[key]) patch[key] = value;
  }
  if (updateStockLevels) {
    const raw = incoming.stock;
    const value = raw == null || raw === '' ? null : parseInt(raw, 10);
    const next = value == null || isNaN(value) ? null : value;
    // null in the file = "not tracked here"; leave the local number alone
    // rather than switching an existing tracked product off.
    if (next != null && next !== existing.stock) patch.stock = next;
  }
  return patch;
}

function cleanNewProduct(incoming, { updateStockLevels }) {
  const price = Number(incoming.price);
  const cost = incoming.costPrice == null || incoming.costPrice === '' ? null : Number(incoming.costPrice);
  const stockRaw = incoming.stock == null || incoming.stock === '' ? null : parseInt(incoming.stock, 10);
  return {
    code: String(incoming.code || '').trim(),
    barcode: String(incoming.barcode || '').trim(),
    name: String(incoming.name || '').trim(),
    description: String(incoming.description || '').trim(),
    category: String(incoming.category || '').trim(),
    unit: String(incoming.unit || '').trim() || 'ชิ้น',
    costPrice: cost == null || isNaN(cost) ? null : cost,
    price: isNaN(price) ? 0 : price,
    stock: !updateStockLevels || stockRaw == null || isNaN(stockRaw) ? null : stockRaw,
    createdAt: incoming.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Write imported products into the active store.
 *
 * @param {{products: Array, stockLogs?: Array}} parsed  from parseStockFile
 * @param {object} options
 * @param {'merge'|'replace'} options.mode          merge = update/add, replace = wipe first
 * @param {boolean} options.updateStockLevels        also apply the คงเหลือ column
 * @param {boolean} options.includeLogs              restore movement history (replace mode only)
 * @returns {Promise<{added:number, updated:number, skipped:number, errors:string[]}>}
 */
export async function importStock(parsed, {
  mode = 'merge',
  updateStockLevels = true,
  includeLogs = false,
} = {}) {
  const incomingList = parsed?.products || [];
  const summary = { added: 0, updated: 0, skipped: 0, errors: [] };

  if (mode === 'replace') {
    await db.stockLogs.clear();
    await db.products.clear();
  }

  let existing = mode === 'replace' ? [] : await db.products.toArray();

  // The `code` index is unique, so a fresh code has to be allocated whenever
  // the file's code is missing or already taken by a different product.
  let nextCodeNumber = parseInt((await getNextProductCode()).slice(2), 10) || 1;
  const usedCodes = new Set(existing.map(p => norm(p.code)).filter(Boolean));
  const allocateCode = () => {
    let code;
    do {
      code = `P-${String(nextCodeNumber++).padStart(4, '0')}`;
    } while (usedCodes.has(norm(code)));
    usedCodes.add(norm(code));
    return code;
  };

  const idMap = new Map(); // old product id → new id, for the movement history

  for (const incoming of incomingList) {
    const name = String(incoming?.name || '').trim();
    if (!name) { summary.skipped++; continue; }

    try {
      const match = mode === 'replace' ? null : findExisting(incoming, existing);
      if (match) {
        const patch = mergeFields(match, incoming, { updateStockLevels });
        if (Object.keys(patch).length) {
          patch.updatedAt = new Date().toISOString();
          await db.products.update(match.id, patch);
          Object.assign(match, patch);
          summary.updated++;
        } else {
          summary.skipped++;
        }
        if (incoming.id != null) idMap.set(incoming.id, match.id);
      } else {
        const product = cleanNewProduct(incoming, { updateStockLevels });
        if (!product.code || usedCodes.has(norm(product.code))) product.code = allocateCode();
        else usedCodes.add(norm(product.code));
        const newId = await db.products.add(product);
        existing.push({ ...product, id: newId });
        if (incoming.id != null) idMap.set(incoming.id, newId);
        summary.added++;
      }
    } catch (err) {
      summary.skipped++;
      summary.errors.push(`${name}: ${err.message}`);
    }
  }

  // History is only restored on a clean replace — merging it into a machine
  // that already has movements would double-count the same events.
  if (includeLogs && mode === 'replace' && parsed?.stockLogs?.length) {
    for (const { id, ...log } of parsed.stockLogs) {
      const productId = idMap.get(log.productId);
      if (productId == null) continue;
      try { await db.stockLogs.add({ ...log, productId }); } catch { /* non-fatal */ }
    }
  }

  return summary;
}
