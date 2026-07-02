import PocketBase from 'pocketbase';

// Where the PocketBase server lives. On a single machine this is localhost;
// on a LAN, the client machines point at the host machine's IP, e.g.
// http://192.168.1.50:8090 (set once in Settings → ที่เก็บข้อมูล).
export function getPbUrl() {
  try {
    return localStorage.getItem('pbUrl') || 'http://127.0.0.1:8090';
  } catch {
    return 'http://127.0.0.1:8090';
  }
}

export function setPbUrl(url) {
  try { localStorage.setItem('pbUrl', url); } catch {}
}

// 'pocketbase' | 'supabase' to use a server; anything else (default) stays on
// IndexedDB.
export function storageMode() {
  try {
    const m = localStorage.getItem('texStorage');
    return m === 'pocketbase' || m === 'supabase' ? m : 'indexeddb';
  } catch {
    return 'indexeddb';
  }
}

export function setStorageMode(mode) {
  const m = mode === 'pocketbase' || mode === 'supabase' ? mode : 'indexeddb';
  try { localStorage.setItem('texStorage', m); } catch {}
}

export const pb = new PocketBase(getPbUrl());
pb.autoCancellation(false); // we issue many parallel reads on load; don't auto-cancel

// Persist a new URL AND retarget the live client. Without updating
// `pb.baseUrl`, the connection test in Settings would keep pinging the
// previously-saved URL instead of the one the user just typed.
export function applyPbUrl(url) {
  setPbUrl(url);
  try { pb.baseUrl = url; } catch { /* ignore */ }
}

// Quick reachability probe for the settings UI.
export async function pingPb() {
  try {
    await pb.health.check();
    return true;
  } catch {
    return false;
  }
}

export default pb;
