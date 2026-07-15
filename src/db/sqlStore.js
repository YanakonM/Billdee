// SQLite-backed store for when the app runs as an installed Tauri desktop app.
// Mirrors the subset of the Dexie API the app uses. Each row keeps the full
// object in a `data` JSON column plus a few indexed columns for lookups, so
// adding fields never needs a schema migration. IDs are INTEGER AUTOINCREMENT
// (same shape as the old Dexie numeric ids).

export function isTauri() {
  return typeof window !== 'undefined' &&
    !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

// Extra indexed columns per table (besides id + data).
const COLS = {
  customers: ['name', 'code'],
  products: ['barcode', 'code'],
  invoices: ['invoiceNumber'],
  quotations: ['quotationNumber'],
  creditNotes: ['noteNumber'],
};

const flat = (r) => ({ id: r.id, ...JSON.parse(r.data) });

let _db = null;
let _initPromise = null;

async function ensureColumn(d, table, column) {
  const cols = await d.select(`PRAGMA table_info(${table})`);
  if (!cols.some(c => c.name === column)) {
    await d.execute(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
  }
}

async function backfillIndexedColumns(d, table, cols) {
  if (!cols.length) return;
  const rows = await d.select(`SELECT id, data FROM ${table}`);
  for (const row of rows) {
    let obj;
    try { obj = JSON.parse(row.data); } catch { continue; }
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const values = [...cols.map(c => obj?.[c] ?? null), row.id];
    await d.execute(`UPDATE ${table} SET ${sets} WHERE id = $${values.length}`, values);
  }
}

async function ensureDb() {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = (async () => {
      const Database = (await import('@tauri-apps/plugin-sql')).default;
      const d = await Database.load('sqlite:tex_v2.db');
      await d.execute('CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, name TEXT, code TEXT)');
      await d.execute('CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, barcode TEXT, code TEXT)');
      await d.execute('CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, invoiceNumber TEXT)');
      await d.execute('CREATE TABLE IF NOT EXISTS quotations (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, quotationNumber TEXT)');
      await d.execute('CREATE TABLE IF NOT EXISTS creditNotes (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, noteNumber TEXT)');
      await d.execute('CREATE TABLE IF NOT EXISTS stockLogs (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL)');
      await d.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
      await ensureColumn(d, 'invoices', 'invoiceNumber');
      await ensureColumn(d, 'quotations', 'quotationNumber');
      await ensureColumn(d, 'creditNotes', 'noteNumber');
      await backfillIndexedColumns(d, 'invoices', COLS.invoices);
      await backfillIndexedColumns(d, 'quotations', COLS.quotations);
      await backfillIndexedColumns(d, 'creditNotes', COLS.creditNotes);
      await d.execute('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');
      await d.execute('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
      // Match Dexie's `&code` unique index so the two storage modes behave the
      // same. try/catch: an existing DB that already contains duplicate codes
      // must still open — the index is then skipped rather than bricking init.
      try { await d.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code ON customers(code)'); } catch { /* duplicates exist — skip */ }
      try { await d.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code ON products(code)'); } catch { /* duplicates exist — skip */ }
      try { await d.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoiceNumber ON invoices(invoiceNumber) WHERE invoiceNumber IS NOT NULL'); } catch { /* duplicates exist — skip */ }
      try { await d.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_quotationNumber ON quotations(quotationNumber) WHERE quotationNumber IS NOT NULL'); } catch { /* duplicates exist — skip */ }
      try { await d.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_creditNotes_noteNumber ON creditNotes(noteNumber) WHERE noteNumber IS NOT NULL'); } catch { /* duplicates exist — skip */ }
      _db = d;
      return d;
    })();
  }
  return _initPromise;
}

function collection(table) {
  const cols = COLS[table] || [];
  return {
    async toArray() {
      const d = await ensureDb();
      const rows = await d.select(`SELECT id, data FROM ${table}`);
      return rows.map(flat);
    },
    async get(id) {
      const d = await ensureDb();
      const rows = await d.select(`SELECT id, data FROM ${table} WHERE id = $1`, [id]);
      return rows.length ? flat(rows[0]) : undefined;
    },
    async add(obj) {
      const d = await ensureDb();
      const names = ['data', ...cols];
      const ph = names.map((_, i) => `$${i + 1}`).join(', ');
      const values = [JSON.stringify(obj), ...cols.map(c => obj[c] ?? null)];
      const res = await d.execute(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${ph})`, values);
      return res.lastInsertId;
    },
    async update(id, partial) {
      const d = await ensureDb();
      const rows = await d.select(`SELECT data FROM ${table} WHERE id = $1`, [id]);
      if (!rows.length) return 0;
      const merged = { ...JSON.parse(rows[0].data), ...partial };
      const sets = ['data = $1', ...cols.map((c, i) => `${c} = $${i + 2}`)];
      const values = [JSON.stringify(merged), ...cols.map(c => merged[c] ?? null), id];
      await d.execute(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
      return 1;
    },
    async delete(id) {
      const d = await ensureDb();
      await d.execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
    },
    async count() {
      const d = await ensureDb();
      const rows = await d.select(`SELECT COUNT(*) AS c FROM ${table}`);
      return rows[0]?.c ?? 0;
    },
    async bulkAdd(arr) {
      for (const obj of arr) await this.add(obj);
    },
    async clear() {
      const d = await ensureDb();
      await d.execute(`DELETE FROM ${table}`);
    },
    where(field) {
      return {
        equals(val) {
          return {
            async first() {
              const d = await ensureDb();
              const rows = await d.select(`SELECT id, data FROM ${table} WHERE ${field} = $1 LIMIT 1`, [val]);
              return rows.length ? flat(rows[0]) : undefined;
            },
          };
        },
      };
    },
  };
}

const settingsStore = {
  async get(key) {
    const d = await ensureDb();
    const rows = await d.select('SELECT data FROM settings WHERE key = $1', [key]);
    return rows.length ? JSON.parse(rows[0].data) : undefined;
  },
  async put(obj) {
    const d = await ensureDb();
    const data = JSON.stringify({ key: obj.key, value: obj.value });
    await d.execute(
      'INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data = $2',
      [obj.key, data]
    );
  },
  async delete(key) {
    const d = await ensureDb();
    await d.execute('DELETE FROM settings WHERE key = $1', [key]);
  },
  async bulkPut(arr) {
    for (const obj of arr) await this.put(obj);
  },
  async toArray() {
    const d = await ensureDb();
    const rows = await d.select('SELECT data FROM settings');
    return rows.map(r => JSON.parse(r.data));
  },
  async clear() {
    const d = await ensureDb();
    await d.execute('DELETE FROM settings');
  },
};

// SQLite serializes writes on a single connection, so for one machine just run
// the callback; individual statements are durable.
async function transaction(_mode, ...rest) {
  const cb = rest[rest.length - 1];
  return cb();
}

export const sqlStore = {
  customers: collection('customers'),
  products: collection('products'),
  invoices: collection('invoices'),
  quotations: collection('quotations'),
  creditNotes: collection('creditNotes'),
  stockLogs: collection('stockLogs'),
  settings: settingsStore,
  transaction,
};

export default sqlStore;
