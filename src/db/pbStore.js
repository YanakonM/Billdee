import { pb } from './pocketbase';

// A PocketBase-backed drop-in for the subset of the Dexie API this app uses.
// Each record stores the full app object in a `data` JSON field, plus a few
// mirrored indexed columns (name/code/barcode/key) for lookups — so adding a
// new field to an invoice never requires a schema change in PocketBase.

const INDEXED = {
  customers: ['name', 'code'],
  products: ['barcode', 'code'],
  settings: ['key'],
  invoices: [],
  quotations: [],
  creditNotes: [],
  stockLogs: [],
};

const flatten = (rec) => ({ id: rec.id, ...(rec.data || {}) });
const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) out[k] = obj?.[k] ?? '';
  return out;
};
const payload = (name, obj) => ({ data: obj, ...pick(obj, INDEXED[name] || []) });

function collection(name) {
  const col = () => pb.collection(name);
  return {
    async toArray() {
      const recs = await col().getFullList({ sort: '-created' });
      return recs.map(flatten);
    },
    async get(id) {
      try { return flatten(await col().getOne(id)); }
      catch { return undefined; }
    },
    async add(obj) {
      const rec = await col().create(payload(name, obj));
      return rec.id;
    },
    async update(id, partial) {
      const existing = await col().getOne(id);
      const merged = { ...(existing.data || {}), ...partial };
      await col().update(id, payload(name, merged));
      return 1;
    },
    async delete(id) {
      try { await col().delete(id); } catch {}
    },
    async count() {
      return (await col().getList(1, 1)).totalItems;
    },
    async bulkAdd(arr) {
      for (const obj of arr) await col().create(payload(name, obj));
    },
    async clear() {
      const recs = await col().getFullList({ fields: 'id' });
      for (const r of recs) { try { await col().delete(r.id); } catch {} }
    },
    where(field) {
      return {
        equals(val) {
          return {
            async first() {
              try {
                const rec = await col().getFirstListItem(pb.filter(field + ' = {:v}', { v: val }));
                return flatten(rec);
              } catch { return undefined; }
            },
          };
        },
      };
    },
  };
}

// settings is keyed by `key` (not by record id) to match the Dexie schema.
function settingsStore() {
  const col = () => pb.collection('settings');
  const findByKey = async (key) => {
    try { return await col().getFirstListItem(pb.filter('key = {:k}', { k: key })); }
    catch { return null; }
  };
  return {
    async get(key) {
      const rec = await findByKey(key);
      return rec ? { id: rec.id, ...(rec.data || {}) } : undefined;
    },
    async put(obj) {
      const value = { key: obj.key, value: obj.value };
      const rec = await findByKey(obj.key);
      if (rec) await col().update(rec.id, { data: value, key: obj.key });
      else await col().create({ data: value, key: obj.key });
    },
    async delete(key) {
      const rec = await findByKey(key);
      if (rec) { try { await col().delete(rec.id); } catch {} }
    },
    async bulkPut(arr) {
      for (const obj of arr) await this.put(obj);
    },
    async toArray() {
      const recs = await col().getFullList();
      return recs.map(r => ({ id: r.id, ...(r.data || {}) }));
    },
    async clear() {
      const recs = await col().getFullList({ fields: 'id' });
      for (const r of recs) { try { await col().delete(r.id); } catch {} }
    },
  };
}

// PocketBase has no client-side transaction; run the callback directly. The
// running numbers stay correct on a single machine; for true multi-machine
// atomicity, install the optional pb_hook (see README-POCKETBASE.md).
async function transaction(_mode, ...rest) {
  const cb = rest[rest.length - 1];
  return cb();
}

export const pbStore = {
  customers: collection('customers'),
  products: collection('products'),
  invoices: collection('invoices'),
  quotations: collection('quotations'),
  creditNotes: collection('creditNotes'),
  stockLogs: collection('stockLogs'),
  settings: settingsStore(),
  transaction,
};

export default pbStore;
