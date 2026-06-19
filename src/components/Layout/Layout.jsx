import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useApp } from '../../context/AppContext';
import { isTauri } from '../../db/sqlStore';

export default function Layout() {
  const { toasts } = useApp();
  const [otherTabOpen, setOtherTabOpen] = useState(false);

  // Single-tab guard: hold a web lock for the app's lifetime. If another tab
  // already holds it, show a blocking warning — two tabs editing the same
  // IndexedDB invites confusion (stale lists, double prints).
  // Skipped in the Tauri desktop app: SQLite handles concurrent access, and the
  // app shares localhost with browser tabs during dev (false positives).
  useEffect(() => {
    if (!navigator.locks || isTauri()) return;
    let releaseLock;
    navigator.locks.request('texv2-app', { ifAvailable: true }, (lock) => {
      if (!lock) {
        setOtherTabOpen(true);
        return;
      }
      return new Promise((resolve) => { releaseLock = resolve; });
    }).catch(() => {});
    return () => releaseLock?.();
  }, []);

  if (otherTabOpen) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-gray-50)', padding: '24px'
      }}>
        <div className="card" style={{ maxWidth: '460px', textAlign: 'center' }}>
          <div className="card-body" style={{ padding: '40px 32px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ marginBottom: '8px' }}>ระบบเปิดอยู่ในแท็บอื่นแล้ว</h2>
            <p style={{ fontSize: '14px', color: 'var(--color-gray-500)', marginBottom: '20px' }}>
              เพื่อป้องกันข้อมูลสับสน กรุณาใช้งานทีละแท็บ —
              ปิดแท็บนี้แล้วกลับไปใช้แท็บเดิม หรือปิดแท็บเดิมแล้วกดปุ่มด้านล่าง
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              ปิดแท็บอื่นแล้ว — ใช้แท็บนี้
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
