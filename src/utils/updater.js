// In-app auto-update for the installed Tauri desktop app.
// Checks the GitHub Releases `latest.json` (configured in tauri.conf.json),
// and downloads + installs a newer signed version on demand. No-op in browser.
import { isTauri } from '../db/sqlStore';

export async function checkForUpdate() {
  if (!isTauri()) return { supported: false };
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return { supported: true, available: false };
  return {
    supported: true,
    available: true,
    version: update.version,
    notes: update.body || '',
    update,
  };
}

export async function installUpdate(update) {
  await update.downloadAndInstall();
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
