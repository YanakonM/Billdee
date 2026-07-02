import { createClient } from '@supabase/supabase-js';

// A Supabase-backed drop-in for the subset of the Dexie API this app uses —
// same shape as pbStore: each row keeps the full app object in a `data` jsonb
// column plus a few mirrored indexed columns (name/code/barcode/key), so new
// fields never require a schema change. See README-SUPABASE.md for the SQL
// that creates the tables.
//
// ⚠️ Ships as opt-in (Settings → ที่เก็บข้อมูล). Ported faithfully from the
// PocketBase store but NOT yet exercised against a live Supabase project —
// run the connection test in Settings and a quick create/read before trusting
// it with real data.

export function getSupabaseUrl() {
  try { return localStorage.getItem('supabaseUrl') || ''; } catch { return ''; }
}
export function getSupabaseKey() {
  try { return localStorage.getItem('supabaseKey') || ''; } catch { return ''; }
}
export function setSupabaseConfig(url, key) {
  try {
    localStorage.setItem('supabaseUrl', url || '');
    localStorage.setItem('supabaseKey', key || '');
  } catch { /* ignore */ }
  _client = null; // recreate with the new config on next use
}

let _client = null;
function client() {
  if (_client) return _client;
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) {
    throw new Error('ยังไม่ได้ตั้งค่า Supabase — กรอก URL และ anon key ใน ตั้งค่า → ที่เก็บข้อมูล');
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Quick reachability probe for the settings UI.
export async function pingSupabase() {
  try {
    const { error } = await client().from('settings').select('key', { head: true, count: 'exact' });
    return !error;
  } catch {
    return false;
  }
}

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
const throwIf = (error) => { if (error) throw new Error(error.message || String(error)); };

function collection(name) {
  return {
    async toArray() {
      const { data, error } = await client().from(name).select('*')
        .order('created', { ascending: false });
      throwIf(error);
      return (data || []).map(flatten);
    },
    async get(id) {
      const { data, error } = await client().from(name).select('*').eq('id', id).maybeSingle();
      if (error || !data) return undefined;
      return flatten(data);
    },
    async add(obj) {
      const { data, error } = await client().from(name)
        .insert(payload(name, obj)).select('id').single();
      throwIf(error);
      return data.id;
    },
    async update(id, partial) {
      const { data: existing, error: readErr } = await client().from(name)
        .select('data').eq('id', id).maybeSingle();
      throwIf(readErr);
      if (!existing) return 0;
      const merged = { ...(existing.data || {}), ...partial };
      const { error } = await client().from(name).update(payload(name, merged)).eq('id', id);
      throwIf(error);
      return 1;
    },
    async delete(id) {
      try { await client().from(name).delete().eq('id', id); } catch { /* ignore */ }
    },
    async count() {
      const { count, error } = await client().from(name)
        .select('id', { head: true, count: 'exact' });
      throwIf(error);
      return count ?? 0;
    },
    async bulkAdd(arr) {
      for (const obj of arr) await this.add(obj);
    },
    async clear() {
      // neq on an impossible uuid = delete all rows (PostgREST requires a filter)
      const { error } = await client().from(name).delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      throwIf(error);
    },
    where(field) {
      return {
        equals(val) {
          return {
            async first() {
              const { data, error } = await client().from(name).select('*')
                .eq(field, val).limit(1).maybeSingle();
              if (error || !data) return undefined;
              return flatten(data);
            },
          };
        },
      };
    },
  };
}

// settings is keyed by `key` (not by record id) to match the Dexie schema.
function settingsStore() {
  const findByKey = async (key) => {
    const { data, error } = await client().from('settings').select('*')
      .eq('key', key).limit(1).maybeSingle();
    if (error || !data) return null;
    return data;
  };
  return {
    async get(key) {
      const rec = await findByKey(key);
      return rec ? { id: rec.id, ...(rec.data || {}) } : undefined;
    },
    async put(obj) {
      const value = { key: obj.key, value: obj.value };
      const rec = await findByKey(obj.key);
      if (rec) {
        const { error } = await client().from('settings')
          .update({ data: value, key: obj.key }).eq('id', rec.id);
        throwIf(error);
      } else {
        const { error } = await client().from('settings')
          .insert({ data: value, key: obj.key });
        throwIf(error);
      }
    },
    async delete(key) {
      const rec = await findByKey(key);
      if (rec) { try { await client().from('settings').delete().eq('id', rec.id); } catch { /* ignore */ } }
    },
    async bulkPut(arr) {
      for (const obj of arr) await this.put(obj);
    },
    async toArray() {
      const { data, error } = await client().from('settings').select('*');
      throwIf(error);
      return (data || []).map(r => ({ id: r.id, ...(r.data || {}) }));
    },
    async clear() {
      const { error } = await client().from('settings').delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      throwIf(error);
    },
  };
}

// Supabase has no client-side transaction; run the callback directly (same
// caveat as pbStore — the app-wide number lock still serialises reservations
// per machine).
async function transaction(_mode, ...rest) {
  const cb = rest[rest.length - 1];
  return cb();
}

export const supabaseStore = {
  customers: collection('customers'),
  products: collection('products'),
  invoices: collection('invoices'),
  quotations: collection('quotations'),
  creditNotes: collection('creditNotes'),
  stockLogs: collection('stockLogs'),
  settings: settingsStore(),
  transaction,
};

export default supabaseStore;
