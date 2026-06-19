import Dexie from 'dexie';

export const db = new Dexie('TexV2Database');

db.version(1).stores({
  customers: '++id, name, shopName, phone, taxId, &code',
  products: '++id, name, barcode, category, &code',
  invoices: '++id, invoiceNumber, customerId, date, status, type',
  settings: 'key'
});

// Version 2: Add quotations, stock tracking
db.version(2).stores({
  customers: '++id, name, shopName, phone, taxId, &code',
  products: '++id, name, barcode, category, &code, stock',
  invoices: '++id, invoiceNumber, customerId, date, status, type',
  quotations: '++id, quotationNumber, customerId, date, status',
  creditNotes: '++id, noteNumber, invoiceId, customerId, date, type',
  stockLogs: '++id, productId, date, type, quantity',
  settings: 'key'
});

// Initialize default settings
export async function initializeSettings() {
  const existing = await db.settings.get('company');
  if (!existing) {
    await db.settings.bulkPut([
      {
        key: 'company',
        value: {
          name: 'บริษัท ตัวอย่าง จำกัด',
          nameEn: 'Example Company Co., Ltd.',
          address: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
          taxId: '0123456789012',
          branchCode: '00000', // '00000' = สำนักงานใหญ่ (head office)
          phone: '02-123-4567',
          mobile: '089-123-4567',
          email: 'info@example.com',
          website: '',
          logo: null
        }
      },
      {
        key: 'bank',
        value: {
          bankName: 'ธนาคารกสิกรไทย',
          accountName: 'บริษัท ตัวอย่าง จำกัด',
          accountNumber: '012-3-45678-9',
          promptPayId: ''
        }
      },
      {
        key: 'invoice',
        value: {
          prefix: 'INV',
          nextNumber: 1,
          vatRate: 7,
          includeVat: true,
          dateFormat: 'th',
          documentType: 'both',
          quotationPrefix: 'QT',
          nextQuotationNumber: 1,
          creditNotePrefix: 'CN',
          nextCreditNoteNumber: 1,
          debitNotePrefix: 'DN',
          nextDebitNoteNumber: 1,
          deliveryNotePrefix: 'DO',
          nextDeliveryNoteNumber: 1,
        }
      },
      {
        key: 'lastPreparedBy',
        value: ''
      },
      {
        key: 'language',
        value: 'th'
      },
      {
        key: 'stockSettings',
        value: {
          trackStock: true,
          lowStockThreshold: 10,
          showStockWarning: true,
        }
      }
    ]);
  }
  // Ensure language setting exists
  const langSetting = await db.settings.get('language');
  if (!langSetting) {
    await db.settings.put({ key: 'language', value: 'th' });
  }
  const stockSetting = await db.settings.get('stockSettings');
  if (!stockSetting) {
    await db.settings.put({
      key: 'stockSettings',
      value: { trackStock: true, lowStockThreshold: 10, showStockWarning: true }
    });
  }
  // Give delivery notes a distinct prefix when it still clashes with debit notes.
  const invSetting = await db.settings.get('invoice');
  if (invSetting && (!invSetting.value.deliveryNotePrefix ||
      invSetting.value.deliveryNotePrefix === invSetting.value.debitNotePrefix)) {
    invSetting.value.deliveryNotePrefix = 'DO';
    if (invSetting.value.nextDeliveryNoteNumber == null) invSetting.value.nextDeliveryNoteNumber = 1;
    await db.settings.put(invSetting);
  }
}

// Generate next invoice number
export async function getNextInvoiceNumber() {
  const setting = await db.settings.get('invoice');
  if (!setting) return 'INV-000001';
  const { prefix, nextNumber } = setting.value;
  const padded = String(nextNumber).padStart(6, '0');
  return `${prefix}-${padded}`;
}

// Generate next quotation number
export async function getNextQuotationNumber() {
  const setting = await db.settings.get('invoice');
  if (!setting) return 'QT-000001';
  const prefix = setting.value.quotationPrefix || 'QT';
  const nextNum = setting.value.nextQuotationNumber || 1;
  return `${prefix}-${String(nextNum).padStart(6, '0')}`;
}

// Generate next credit/debit note number
export async function getNextCreditNoteNumber(type = 'credit') {
  const setting = await db.settings.get('invoice');
  if (!setting) return 'CN-000001';
  const prefix = type === 'credit' 
    ? (setting.value.creditNotePrefix || 'CN') 
    : (setting.value.debitNotePrefix || 'DN');
  const nextNum = type === 'credit'
    ? (setting.value.nextCreditNoteNumber || 1)
    : (setting.value.nextDebitNoteNumber || 1);
  return `${prefix}-${String(nextNum).padStart(6, '0')}`;
}

// Highest numeric suffix among existing codes with the given prefix, e.g. "C-".
// Using max (not count) keeps codes unique even after rows are deleted, so the
// `&code` unique index never rejects an insert with a recycled number.
async function maxCodeNumber(table, prefix) {
  const all = await table.toArray();
  return all.reduce((max, row) => {
    if (!row.code || !row.code.startsWith(prefix)) return max;
    const n = parseInt(row.code.slice(prefix.length), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
}

// Atomically allocate the next running number for a document kind and persist
// the incremented counter in a single transaction, so two tabs (or a rapid
// double-click) can never produce a duplicate document number.
// kind: 'invoice' | 'quotation' | 'credit' | 'debit'
export async function reserveDocumentNumber(kind = 'invoice') {
  return db.transaction('rw', db.settings, async () => {
    const setting = await db.settings.get('invoice');
    const v = setting.value;
    const conf = {
      invoice:   { prefix: v.prefix || 'INV',          key: 'nextNumber' },
      quotation: { prefix: v.quotationPrefix || 'QT',  key: 'nextQuotationNumber' },
      credit:    { prefix: v.creditNotePrefix || 'CN', key: 'nextCreditNoteNumber' },
      debit:     { prefix: v.debitNotePrefix || 'DN',  key: 'nextDebitNoteNumber' },
    }[kind] || { prefix: v.prefix || 'INV', key: 'nextNumber' };
    const num = v[conf.key] || 1;
    v[conf.key] = num + 1;
    await db.settings.put({ key: 'invoice', value: v });
    return `${conf.prefix}-${String(num).padStart(6, '0')}`;
  });
}

// Generate next customer code
export async function getNextCustomerCode() {
  const max = await maxCodeNumber(db.customers, 'C-');
  return `C-${String(max + 1).padStart(4, '0')}`;
}

// Generate next product code
export async function getNextProductCode() {
  const max = await maxCodeNumber(db.products, 'P-');
  return `P-${String(max + 1).padStart(4, '0')}`;
}

// Stock management
export async function updateStock(productId, quantityChange, type = 'sale', note = '') {
  const product = await db.products.get(productId);
  if (!product) return;

  const currentStock = product.stock || 0;
  const newStock = type === 'sale' || type === 'adjustment_out'
    ? currentStock - quantityChange
    : currentStock + quantityChange;

  await db.products.update(productId, { stock: Math.max(0, newStock) });

  // Log stock change
  await db.stockLogs.add({
    productId,
    date: new Date().toISOString(),
    type,
    quantity: quantityChange,
    previousStock: currentStock,
    newStock: Math.max(0, newStock),
    note,
  });
}

// Full backup of every table (not just customers/products/invoices) so nothing
// — quotations, credit notes, stock history — is silently left out.
export async function getBackupData() {
  return {
    customers: await db.customers.toArray(),
    products: await db.products.toArray(),
    invoices: await db.invoices.toArray(),
    quotations: await db.quotations.toArray(),
    creditNotes: await db.creditNotes.toArray(),
    stockLogs: await db.stockLogs.toArray(),
    // autoBackupDir holds a FileSystemDirectoryHandle — not JSON-serializable
    // and machine-specific, so it must never travel inside a backup file.
    settings: (await db.settings.toArray()).filter(s => s.key !== 'autoBackupDir'),
    exportDate: new Date().toISOString(),
    version: '2.1',
  };
}

// Build the backup, trigger a download, and record when we last backed up.
export async function exportBackup() {
  const data = await getBackupData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tex-v2-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  await db.settings.put({ key: 'lastBackupAt', value: new Date().toISOString() });
}

// ============================================================
// Auto-backup to a local folder (File System Access API).
// The user picks a target folder once (e.g. a USB drive or a
// cloud-synced folder); the directory handle is stored in
// IndexedDB and a backup file is written automatically ~daily.
// Chrome/Edge only — window.showDirectoryPicker is the gate.
// ============================================================

export function autoBackupSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// Let the user pick the backup folder, save the handle, and back up now.
export async function setAutoBackupDir() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await db.settings.put({ key: 'autoBackupDir', value: handle });
  await runAutoBackup();
  return handle;
}

export async function clearAutoBackupDir() {
  await db.settings.delete('autoBackupDir');
}

export async function getAutoBackupStatus() {
  const rec = await db.settings.get('autoBackupDir');
  if (!rec?.value) return { configured: false };
  let permission = 'prompt';
  try { permission = await rec.value.queryPermission({ mode: 'readwrite' }); } catch {}
  const last = (await db.settings.get('lastAutoBackupAt'))?.value || null;
  return { configured: true, permission, lastAutoBackupAt: last, folderName: rec.value.name };
}

// Write a backup file into the chosen folder. Must be called from a user
// gesture when permission is 'prompt' (requestPermission requires one).
export async function runAutoBackup() {
  const rec = await db.settings.get('autoBackupDir');
  if (!rec?.value) return false;
  const handle = rec.value;
  let perm = 'prompt';
  try { perm = await handle.queryPermission({ mode: 'readwrite' }); } catch {}
  if (perm !== 'granted') {
    try { perm = await handle.requestPermission({ mode: 'readwrite' }); } catch { return false; }
  }
  if (perm !== 'granted') return false;

  const data = await getBackupData();
  const fileName = `tex-v2-auto-backup-${new Date().toISOString().split('T')[0]}.json`;
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();

  const now = new Date().toISOString();
  await db.settings.put({ key: 'lastAutoBackupAt', value: now });
  // Also satisfies the dashboard "please back up" reminder.
  await db.settings.put({ key: 'lastBackupAt', value: now });
  return true;
}

// Called on app load: back up silently if a folder is set, permission is
// already granted, and the last auto-backup is older than ~20 hours.
export async function autoBackupIfDue() {
  const rec = await db.settings.get('autoBackupDir');
  if (!rec?.value) return 'not-configured';
  const last = (await db.settings.get('lastAutoBackupAt'))?.value;
  const due = !last || (Date.now() - new Date(last).getTime()) > 20 * 60 * 60 * 1000;
  if (!due) return 'not-due';
  let perm = 'prompt';
  try { perm = await rec.value.queryPermission({ mode: 'readwrite' }); } catch {}
  if (perm !== 'granted') return 'needs-permission';
  try {
    return (await runAutoBackup()) ? 'done' : 'error';
  } catch {
    return 'error';
  }
}

export default db;
