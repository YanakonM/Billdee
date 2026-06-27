import { Component } from 'react';
import { exportBackup } from '../db/database';

// Catches any render/runtime error in the app and shows a recoverable screen
// instead of a blank white window — critical when issuing a bill at the counter.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    // Keep a small local log so a non-technical user can send it to us.
    try {
      const log = JSON.parse(localStorage.getItem('billdee_errorlog') || '[]');
      log.push({ at: new Date().toISOString(), message: error?.message || String(error), stack: (info?.componentStack || '').slice(0, 2000) });
      localStorage.setItem('billdee_errorlog', JSON.stringify(log.slice(-20)));
    } catch { /* ignore */ }
  }

  async handleBackup() {
    try { await exportBackup(); } catch { /* ignore */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-gray-50, #f4f3fb)', padding: '24px', fontFamily: 'Sarabun, sans-serif'
      }}>
        <div style={{
          maxWidth: '460px', textAlign: 'center', background: '#fff', borderRadius: '14px',
          padding: '40px 32px', boxShadow: '0 12px 24px -6px rgba(49,46,129,0.15)'
        }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>😟</div>
          <h2 style={{ marginBottom: '8px', color: '#1e293b' }}>เกิดข้อผิดพลาดในระบบ</h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
            ไม่ต้องกังวล ข้อมูลของคุณยังอยู่ครบ — ลองกดโหลดใหม่ หรือสำรองข้อมูลไว้ก่อนเพื่อความปลอดภัย
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()} style={btn('#4f46e5', '#fff')}>
              🔄 โหลดใหม่
            </button>
            <button onClick={() => this.handleBackup()} style={btn('#fff', '#4f46e5', true)}>
              💾 สำรองข้อมูลฉุกเฉิน
            </button>
          </div>
          <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8', wordBreak: 'break-word' }}>
            {this.state.message}
          </div>
        </div>
      </div>
    );
  }
}

function btn(bg, color, outline) {
  return {
    padding: '10px 20px', borderRadius: '10px', fontWeight: 600, fontSize: '14px',
    cursor: 'pointer', background: bg, color, border: outline ? '1px solid #c7d2fe' : 'none',
  };
}
