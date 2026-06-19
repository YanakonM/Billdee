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

// 'pocketbase' to use the server, anything else (default) stays on IndexedDB.
export function storageMode() {
  try {
    return localStorage.getItem('texStorage') === 'pocketbase' ? 'pocketbase' : 'indexeddb';
  } catch {
    return 'indexeddb';
  }
}

export function setStorageMode(mode) {
  try { localStorage.setItem('texStorage', mode === 'pocketbase' ? 'pocketbase' : 'indexeddb'); } catch {}
}

export const pb = new PocketBase(getPbUrl());
pb.autoCancellation(false); // we issue many parallel reads on load; don't auto-cancel

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
