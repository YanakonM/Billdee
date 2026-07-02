import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import { db, exportBackup, autoBackupIfDue, runAutoBackup } from '../db/database';
import { formatNumber, formatCurrency, formatDateShort } from '../utils/helpers';
import {
  FileText, Users, Package, FilePlus, TrendingUp,
  AlertCircle, Clock, ArrowRight, Receipt, AlertTriangle, FileCheck, BarChart3,
  Download, ShieldCheck
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalInvoices: 0,
    todayInvoices: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    totalCustomers: 0,
    totalProducts: 0,
    unpaidCount: 0,
    unpaidAmount: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [backupReminder, setBackupReminder] = useState(null); // { days, lastAt } when a backup is due
  const [backingUp, setBackingUp] = useState(false);
  const [needsBackupPermission, setNeedsBackupPermission] = useState(false);

  useEffect(() => {
    loadDashboard();
    // Run the daily auto-backup silently; surface a banner only when the
    // browser requires a fresh permission click after a restart.
    autoBackupIfDue().then(result => {
      setNeedsBackupPermission(result === 'needs-permission');
      if (result === 'done') loadDashboard(); // refresh the reminder state
    }).catch(() => {});
  }, []);

  async function handleGrantBackupPermission() {
    try {
      const ok = await runAutoBackup(); // user gesture → can re-request permission
      if (ok) {
        setNeedsBackupPermission(false);
        loadDashboard();
      }
    } catch { /* user dismissed the permission prompt — keep the banner */ }
  }

  async function loadDashboard() {
    const today = new Date().toISOString().split('T')[0];

    const invoices = await db.invoices.toArray();
    const customers = await db.customers.toArray();
    const products = await db.products.count();

    // Backup reminder: nudge if there's data and it hasn't been backed up in 7+ days.
    const lastBackup = await db.settings.get('lastBackupAt');
    const lastAt = lastBackup?.value || null;
    const daysSince = lastAt
      ? Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000)
      : Infinity;
    setBackupReminder(invoices.length > 0 && daysSince >= 7 ? { days: daysSince, lastAt } : null);

    const todayInvoices = invoices.filter(inv => inv.date === today);
    const unpaid = invoices.filter(inv => inv.status === 'unpaid');

    setStats({
      totalInvoices: invoices.length,
      todayInvoices: todayInvoices.length,
      totalRevenue: invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
      todayRevenue: todayInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
      totalCustomers: customers.length,
      totalProducts: products,
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
    });

    // Recent invoices (last 5)
    setRecentInvoices(
      [...invoices]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 5)
    );

    // Top customers by purchase
    const custMap = {};
    invoices.forEach(inv => {
      if (inv.customerName) {
        if (!custMap[inv.customerName]) {
          custMap[inv.customerName] = { name: inv.customerName, total: 0, count: 0 };
        }
        custMap[inv.customerName].total += inv.grandTotal || 0;
        custMap[inv.customerName].count += 1;
      }
    });
    setTopCustomers(
      Object.values(custMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    );

    // Overdue: unpaid invoices older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const overdueDate = sevenDaysAgo.toISOString().split('T')[0];
    setOverdueInvoices(
      invoices.filter(inv => inv.status === 'unpaid' && inv.date < overdueDate)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5)
    );

    // Low stock (threshold + visibility from settings)
    const stockSetting = await db.settings.get('stockSettings');
    const threshold = stockSetting?.value?.lowStockThreshold ?? 10;
    const showWarning = stockSetting?.value?.showStockWarning ?? true;
    const prods = await db.products.toArray();
    setLowStockProducts(
      !showWarning ? [] :
      prods.filter(p => p.stock != null && p.stock <= threshold)
        .sort((a, b) => (a.stock || 0) - (b.stock || 0))
        .slice(0, 5)
    );
  }

  async function handleBackupNow() {
    setBackingUp(true);
    try {
      await exportBackup();
      setBackupReminder(null);
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <>
      <Header
        title="แดชบอร์ด"
        subtitle="ภาพรวมระบบใบกำกับภาษี"
      />
      <div className="page-content">
        {/* Auto-backup needs a permission click after browser restart */}
        {needsBackupPermission && (
          <div className="card" style={{
            borderLeft: '4px solid var(--color-primary-500)',
            marginBottom: '20px', background: 'var(--color-primary-50)'
          }}>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <ShieldCheck size={28} color="var(--color-primary-600)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: '220px', fontSize: '14px' }}>
                <strong>สำรองอัตโนมัติรอการยืนยัน</strong>
                <div style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                  เบราว์เซอร์ขอให้ยืนยันสิทธิ์เข้าถึงโฟลเดอร์สำรองอีกครั้ง (เกิดขึ้นหลังเปิดเบราว์เซอร์ใหม่)
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleGrantBackupPermission}>
                ยืนยันและสำรองเลย
              </button>
            </div>
          </div>
        )}

        {/* Backup reminder */}
        {backupReminder && (
          <div className="card" style={{
            borderLeft: '4px solid var(--color-warning-500)',
            marginBottom: '20px', background: 'var(--color-warning-50)'
          }}>
            <div className="card-body" style={{
              display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'
            }}>
              <ShieldCheck size={28} color="var(--color-warning-600)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: '220px', fontSize: '14px' }}>
                <strong>ถึงเวลาสำรองข้อมูลแล้ว</strong>
                <div style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                  {backupReminder.lastAt
                    ? `สำรองครั้งล่าสุดเมื่อ ${backupReminder.days} วันก่อน`
                    : 'คุณยังไม่เคยสำรองข้อมูล'} — ข้อมูลเก็บในเครื่องนี้เท่านั้น หากล้างเบราว์เซอร์จะหายทั้งหมด
                </div>
              </div>
              <button className="btn btn-accent" onClick={handleBackupNow} disabled={backingUp}>
                <Download size={18} /> {backingUp ? 'กำลังสำรอง...' : 'สำรองข้อมูลตอนนี้'}
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card stat-card--primary">
            <div className="stat-icon stat-icon--primary">
              <FileText size={24} />
            </div>
            <div className="stat-info">
              <div className="stat-label">ใบเสร็จวันนี้</div>
              <div className="stat-value">{stats.todayInvoices}</div>
              <div className="stat-change text-muted" style={{ fontSize: '12px' }}>
                ทั้งหมด {stats.totalInvoices} ใบ
              </div>
            </div>
          </div>

          <div className="stat-card stat-card--success">
            <div className="stat-icon stat-icon--success">
              <TrendingUp size={24} />
            </div>
            <div className="stat-info">
              <div className="stat-label">ยอดขายวันนี้</div>
              <div className="stat-value">{formatNumber(stats.todayRevenue, 0)}</div>
              <div className="stat-change text-muted" style={{ fontSize: '12px' }}>
                รวม ฿{formatNumber(stats.totalRevenue, 0)}
              </div>
            </div>
          </div>

          <div className="stat-card stat-card--accent">
            <div className="stat-icon stat-icon--accent">
              <Users size={24} />
            </div>
            <div className="stat-info">
              <div className="stat-label">ลูกค้าทั้งหมด</div>
              <div className="stat-value">{stats.totalCustomers}</div>
              <div className="stat-change text-muted" style={{ fontSize: '12px' }}>
                สินค้า {stats.totalProducts} รายการ
              </div>
            </div>
          </div>

          <div className="stat-card stat-card--warning">
            <div className="stat-icon stat-icon--warning">
              <AlertCircle size={24} />
            </div>
            <div className="stat-info">
              <div className="stat-label">ค้างชำระ</div>
              <div className="stat-value">{stats.unpaidCount}</div>
              <div className="stat-change text-danger" style={{ fontSize: '12px' }}>
                ฿{formatNumber(stats.unpaidAmount, 0)}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Recent Invoices */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <Clock size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                ใบเสร็จล่าสุด
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => navigate('/invoices')}>
                ดูทั้งหมด <ArrowRight size={14} />
              </button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {recentInvoices.length > 0 ? (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>เลขที่</th>
                        <th>ลูกค้า</th>
                        <th className="text-right">ยอด</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInvoices.map((inv) => (
                        <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/invoices/${inv.id}`)}>
                          <td style={{ fontFamily: 'var(--font-en)', fontWeight: 600, fontSize: '13px' }}>
                            {inv.invoiceNumber}
                          </td>
                          <td>{inv.customerName || '-'}</td>
                          <td className="text-right text-bold">
                            {formatNumber(inv.grandTotal)}
                          </td>
                          <td>
                            <span className={`badge ${inv.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                              {inv.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <Receipt size={48} />
                  <p className="empty-state-title">ยังไม่มีใบเสร็จ</p>
                  <p className="empty-state-text">กดปุ่ม "สร้างใบเสร็จใหม่" เพื่อเริ่มต้น</p>
                </div>
              )}
            </div>
          </div>

          {/* Top Customers */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <Users size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                ลูกค้ายอดซื้อสูงสุด
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => navigate('/customers')}>
                ดูทั้งหมด <ArrowRight size={14} />
              </button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {topCustomers.length > 0 ? (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ลูกค้า</th>
                        <th className="text-center">จำนวนใบเสร็จ</th>
                        <th className="text-right">ยอดรวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCustomers.map((cust, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{cust.name}</td>
                          <td className="text-center">{cust.count}</td>
                          <td className="text-right text-bold">{formatNumber(cust.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <Users size={48} />
                  <p className="empty-state-title">ยังไม่มีข้อมูลลูกค้า</p>
                  <p className="empty-state-text">เพิ่มลูกค้าและสร้างใบเสร็จ</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alerts Row */}
        {(overdueInvoices.length > 0 || lowStockProducts.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
            {/* Overdue Payments */}
            {overdueInvoices.length > 0 && (
              <div className="card" style={{ borderLeft: '4px solid var(--color-danger-500)' }}>
                <div className="card-header">
                  <h3 className="card-title" style={{ color: 'var(--color-danger-600)' }}>
                    <AlertTriangle size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                    แจ้งเตือนค้างชำระ ({overdueInvoices.length})
                  </h3>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {overdueInvoices.map(inv => {
                    const days = Math.floor((Date.now() - new Date(inv.date).getTime()) / 86400000);
                    return (
                      <div key={inv.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 16px', borderBottom: '1px solid var(--color-gray-100)',
                        cursor: 'pointer'
                      }} onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{inv.customerName || 'ไม่ระบุ'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-danger-500)' }}>
                            {inv.invoiceNumber} · ค้างมา {days} วัน
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-en)', color: 'var(--color-danger-600)' }}>
                          ฿{formatNumber(inv.grandTotal, 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Low Stock */}
            {lowStockProducts.length > 0 && (
              <div className="card" style={{ borderLeft: '4px solid var(--color-warning-500)' }}>
                <div className="card-header">
                  <h3 className="card-title" style={{ color: 'var(--color-warning-600)' }}>
                    <Package size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                    สินค้าใกล้หมด ({lowStockProducts.length})
                  </h3>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {lowStockProducts.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 16px', borderBottom: '1px solid var(--color-gray-100)',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.name}</div>
                      <span className={`badge ${p.stock <= 0 ? 'badge-danger' : 'badge-warning'}`}>
                        {p.stock <= 0 ? 'หมด' : `เหลือ ${p.stock} ${p.unit}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ marginBottom: '12px', fontWeight: 700, fontSize: '16px' }}>⚡ ทางลัด</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
            {[
              { label: 'สร้างใบเสร็จ', path: '/create-invoice', icon: FilePlus, color: 'var(--color-primary-500)' },
              { label: 'ใบเสนอราคา', path: '/quotations', icon: FileCheck, color: 'var(--color-accent-500)' },
              { label: 'ดูรายงาน', path: '/reports', icon: BarChart3, color: 'var(--color-success-500)' },
              { label: 'เพิ่มลูกค้า', path: '/customers', icon: Users, color: 'var(--color-warning-500)' },
              { label: 'เพิ่มสินค้า', path: '/products', icon: Package, color: '#8b5cf6' },
            ].map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.path}
                  className="card"
                  onClick={() => navigate(action.path)}
                  style={{
                    padding: '20px 16px', cursor: 'pointer', border: 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: `${action.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon size={20} color={action.color} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
