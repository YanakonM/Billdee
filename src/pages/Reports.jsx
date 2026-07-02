import { useState, useEffect, useMemo } from 'react';
import Header from '../components/Layout/Header';
import { db } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateShort } from '../utils/helpers';
import {
  BarChart3, TrendingUp, Users, Package, Download,
  Calendar, FileSpreadsheet, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

// Simple bar chart component (no external library needed).
// Bar heights are computed in PIXELS (not %) so they never collapse — a
// percentage height needs a definite parent height, which is fragile through
// nested flex containers. Pixels are bulletproof.
function SimpleBarChart({ data, maxValue, color = '#6366f1', height = 250 }) {
  if (!data.length) return null;
  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  const labelRowH = 28;                                 // space for x-axis labels
  const chartH = Math.max(height - labelRowH, 60);      // drawing area (px)
  const usable = chartH * 0.82;                         // headroom for the value number

  return (
    <div style={{ width: '100%' }}>
      <div style={{ height: chartH, display: 'flex', alignItems: 'flex-end', gap: '2px', padding: '0 4px' }}>
        {data.map((d, i) => {
          const barH = d.value > 0 ? Math.max((d.value / max) * usable, 3) : 0;
          return (
            <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
              {d.value > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', marginBottom: '3px', whiteSpace: 'nowrap' }}>
                  {formatNumber(d.value, 0)}
                </div>
              )}
              <div
                style={{
                  width: '100%',
                  maxWidth: '40px',
                  height: `${barH}px`,
                  background: color,
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.5s ease',
                  cursor: 'pointer',
                }}
                title={`${d.label}: ฿${formatNumber(d.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '2px', padding: '8px 4px 0', borderTop: '1px solid var(--color-gray-200)' }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: 'var(--color-gray-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Reports() {
  const { showToast } = useApp();
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [period, setPeriod] = useState('month'); // week, month, year, custom
  const [activeTab, setActiveTab] = useState('sales');
  // Year mode: pick any year (this or past). Custom mode: month-to-month range
  // (can span years) via <input type="month">.
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState(`${new Date().getFullYear()}-01`);
  const [customTo, setCustomTo] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setInvoices(await db.invoices.toArray());
    setCustomers(await db.customers.toArray());
    setProducts(await db.products.toArray());
  }

  // Years that actually have data (plus the current year), newest first.
  const availableYears = useMemo(() => {
    const ys = new Set(
      invoices.map(i => parseInt((i.date || '').slice(0, 4), 10)).filter(n => n > 2000)
    );
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [invoices]);

  // Calculate period range
  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
    }
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
    }
    if (period === 'year') {
      return { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31` };
    }
    // custom: month-to-month (inclusive), may span years
    const from = /^\d{4}-\d{2}$/.test(customFrom) ? customFrom : `${now.getFullYear()}-01`;
    const to = /^\d{4}-\d{2}$/.test(customTo) ? customTo : from;
    const [ty, tm] = to.split('-').map(Number);
    const lastDay = new Date(ty, tm, 0).getDate();
    const range = { start: `${from}-01`, end: `${to}-${String(lastDay).padStart(2, '0')}` };
    if (range.start > range.end) return { start: range.end.slice(0, 8) + '01', end: range.start };
    return range;
  }, [period, selectedYear, customFrom, customTo]);

  // Filtered invoices by period
  const periodInvoices = useMemo(() => {
    return invoices.filter(inv => inv.date >= dateRange.start && inv.date <= dateRange.end);
  }, [invoices, dateRange]);

  // Summary stats
  const stats = useMemo(() => {
    const total = periodInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
    const paid = periodInvoices.filter(i => i.status === 'paid');
    const unpaid = periodInvoices.filter(i => i.status === 'unpaid');
    const paidAmount = paid.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
    const unpaidAmount = unpaid.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
    const avgPerInvoice = periodInvoices.length > 0 ? total / periodInvoices.length : 0;

    return { total, paidAmount, unpaidAmount, count: periodInvoices.length, avgPerInvoice, paidCount: paid.length, unpaidCount: unpaid.length };
  }, [periodInvoices]);

  // Chart data: daily buckets for week/month, monthly buckets for year/custom.
  const dailyData = useMemo(() => {
    const days = {};
    const now = new Date();

    if (period === 'year' || period === 'custom') {
      const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const spansYears = dateRange.start.slice(0, 4) !== dateRange.end.slice(0, 4);
      let [y, m] = dateRange.start.slice(0, 7).split('-').map(Number);
      const [ey, em] = dateRange.end.slice(0, 7).split('-').map(Number);
      let guard = 0;
      while ((y < ey || (y === ey && m <= em)) && guard++ < 120) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        // Append the BE year (พ.ศ. 2 หลัก) when the range spans years.
        days[key] = { label: spansYears ? `${months[m - 1]}${String((y + 543) % 100)}` : months[m - 1], value: 0 };
        m++; if (m > 12) { m = 1; y++; }
      }
      periodInvoices.forEach(inv => {
        const key = inv.date?.substring(0, 7);
        if (days[key]) days[key].value += inv.grandTotal || 0;
      });
    } else {
      const daysCount = period === 'week' ? 7 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        days[key] = { label: `${d.getDate()}`, value: 0 };
      }
      periodInvoices.forEach(inv => {
        if (days[inv.date]) days[inv.date].value += inv.grandTotal || 0;
      });
    }
    return Object.values(days);
  }, [periodInvoices, period, dateRange]);

  // Top customers
  const topCustomerData = useMemo(() => {
    const map = {};
    periodInvoices.forEach(inv => {
      const name = inv.customerName || 'ไม่ระบุ';
      if (!map[name]) map[name] = { name, total: 0, count: 0 };
      map[name].total += inv.grandTotal || 0;
      map[name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [periodInvoices]);

  // Top products
  const topProductData = useMemo(() => {
    const map = {};
    periodInvoices.forEach(inv => {
      (inv.items || []).forEach(item => {
        const name = item.description || 'ไม่ระบุ';
        if (!map[name]) map[name] = { name, total: 0, quantity: 0 };
        map[name].total += item.total || 0;
        map[name].quantity += parseFloat(item.quantity) || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [periodInvoices]);

  // Export CSV
  function exportCSV() {
    const headers = ['เลขที่ใบเสร็จ', 'วันที่', 'ลูกค้า', 'ประเภท', 'ยอดรวม', 'สถานะ'];
    const rows = periodInvoices.map(inv => [
      inv.invoiceNumber,
      inv.date,
      inv.customerName || '',
      inv.type === 'tax_invoice' ? 'ใบกำกับภาษี' : 'ใบเสร็จ',
      inv.grandTotal?.toFixed(2) || '0.00',
      inv.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ',
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billdee-report-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออก CSV สำเร็จ');
  }

  // Export Excel-like (TSV format that Excel opens natively)
  function exportExcel() {
    const headers = ['เลขที่ใบเสร็จ', 'วันที่', 'ลูกค้า', 'ที่อยู่', 'ประเภท', 'รายการ', 'จำนวน', 'ราคา/หน่วย', 'ส่วนลด', 'ยอดรวมสินค้า', 'VAT', 'ยอดรวมสุทธิ', 'สถานะ', 'ช่องทางชำระ'];
    const rows = [];
    periodInvoices.forEach(inv => {
      (inv.items || [{ description: '-' }]).forEach((item, idx) => {
        rows.push([
          idx === 0 ? inv.invoiceNumber : '',
          idx === 0 ? inv.date : '',
          idx === 0 ? (inv.customerName || '') : '',
          idx === 0 ? (inv.customerAddress || '') : '',
          idx === 0 ? (inv.type === 'tax_invoice' ? 'ใบกำกับภาษี' : 'ใบเสร็จ') : '',
          item.description || '',
          item.quantity || '',
          item.unitPrice || '',
          item.discount || '',
          idx === 0 ? (inv.subtotal?.toFixed(2) || '') : '',
          idx === 0 ? (inv.vatAmount?.toFixed(2) || '') : '',
          idx === 0 ? (inv.grandTotal?.toFixed(2) || '') : '',
          idx === 0 ? (inv.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ') : '',
          idx === 0 ? (inv.paymentMethod || '') : '',
        ]);
      });
    });
    const tsv = '\uFEFF' + [headers, ...rows].map(r => r.join('\t')).join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billdee-report-${dateRange.start}-to-${dateRange.end}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออก Excel สำเร็จ');
  }

  const periodLabels = {
    week: 'สัปดาห์นี้',
    month: 'เดือนนี้',
    year: `ปี ${selectedYear + 543}`,
    custom: 'ช่วงที่เลือก',
  };

  return (
    <>
      <Header
        title="รายงาน"
        subtitle="สรุปยอดขายและวิเคราะห์ข้อมูล"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline btn-sm" onClick={exportCSV}>
              <FileSpreadsheet size={16} /> CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={exportExcel}>
              <Download size={16} /> Excel
            </button>
          </div>
        }
      />
      <div className="page-content">
        {/* Period Selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['year', 'รายปี'], ['custom', 'กำหนดเอง']].map(([p, label]) => (
            <button
              key={p}
              className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setPeriod(p)}
            >
              <Calendar size={14} />
              {label}
            </button>
          ))}

          {/* Year picker — includes past years that have data */}
          {period === 'year' && (
            <select className="form-select" value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
              style={{ width: 'auto', padding: '6px 28px 6px 10px', fontSize: '13px' }}>
              {availableYears.map(y => (
                <option key={y} value={y}>ปี {y + 543} ({y})</option>
              ))}
            </select>
          )}

          {/* Custom month-to-month range (can span years) */}
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' }}>
              <span>ตั้งแต่</span>
              <input type="month" className="form-input" value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={{ width: 'auto', padding: '5px 8px', fontSize: '13px' }} />
              <span>ถึง</span>
              <input type="month" className="form-input" value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={{ width: 'auto', padding: '5px 8px', fontSize: '13px' }} />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card stat-card--primary">
            <div className="stat-icon stat-icon--primary"><TrendingUp size={24} /></div>
            <div className="stat-info">
              <div className="stat-label">ยอดขายรวม</div>
              <div className="stat-value">{formatNumber(stats.total, 0)}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>{stats.count} ใบ</div>
            </div>
          </div>
          <div className="stat-card stat-card--success">
            <div className="stat-icon stat-icon--success"><ArrowUpRight size={24} /></div>
            <div className="stat-info">
              <div className="stat-label">ชำระแล้ว</div>
              <div className="stat-value">{formatNumber(stats.paidAmount, 0)}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-success-600)' }}>{stats.paidCount} ใบ</div>
            </div>
          </div>
          <div className="stat-card stat-card--warning">
            <div className="stat-icon stat-icon--warning"><ArrowDownRight size={24} /></div>
            <div className="stat-info">
              <div className="stat-label">ค้างชำระ</div>
              <div className="stat-value">{formatNumber(stats.unpaidAmount, 0)}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-warning-600)' }}>{stats.unpaidCount} ใบ</div>
            </div>
          </div>
          <div className="stat-card stat-card--accent">
            <div className="stat-icon stat-icon--accent"><BarChart3 size={24} /></div>
            <div className="stat-info">
              <div className="stat-label">เฉลี่ยต่อใบ</div>
              <div className="stat-value">{formatNumber(stats.avgPerInvoice, 0)}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>บาท</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {[
            { id: 'sales', label: '📊 ยอดขาย', icon: BarChart3 },
            { id: 'customers', label: '👥 ลูกค้า', icon: Users },
            { id: 'products', label: '📦 สินค้า', icon: Package },
          ].map(tab => (
            <button
              key={tab.id}
              className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sales Chart */}
        {activeTab === 'sales' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                📊 {(period === 'year' || period === 'custom') ? 'ยอดขายรายเดือน' : 'ยอดขายรายวัน'} ({periodLabels[period]})
              </h3>
            </div>
            <div className="card-body">
              <SimpleBarChart
                data={dailyData}
                height={250}
                color="#6366f1"
              />
            </div>
          </div>
        )}

        {/* Top Customers */}
        {activeTab === 'customers' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">👥 ลูกค้ายอดซื้อสูงสุด ({periodLabels[period]})</h3>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ลูกค้า</th>
                    <th className="text-center">จำนวนใบเสร็จ</th>
                    <th className="text-right">ยอดรวม</th>
                    <th>สัดส่วน</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomerData.map((c, idx) => (
                    <tr key={idx}>
                      <td className="text-center" style={{ fontWeight: 700, color: idx < 3 ? 'var(--color-accent-600)' : 'var(--color-gray-500)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td className="text-center">{c.count}</td>
                      <td className="text-right text-bold text-mono">{formatNumber(c.total)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '8px', background: 'var(--color-gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${stats.total > 0 ? (c.total / stats.total * 100) : 0}%`,
                              height: '100%',
                              background: idx < 3 ? 'var(--color-accent-500)' : 'var(--color-primary-400)',
                              borderRadius: '4px',
                              transition: 'width 0.5s ease'
                            }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--color-gray-500)', minWidth: '36px' }}>
                            {stats.total > 0 ? (c.total / stats.total * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {topCustomerData.length === 0 && (
                    <tr><td colSpan="5" className="text-center text-muted" style={{ padding: '40px' }}>ไม่มีข้อมูล</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top Products */}
        {activeTab === 'products' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📦 สินค้าขายดี ({periodLabels[period]})</h3>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>สินค้า</th>
                    <th className="text-center">จำนวนที่ขาย</th>
                    <th className="text-right">ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {topProductData.map((p, idx) => (
                    <tr key={idx}>
                      <td className="text-center" style={{ fontWeight: 700, color: idx < 3 ? 'var(--color-accent-600)' : 'var(--color-gray-500)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="text-center text-mono">{p.quantity}</td>
                      <td className="text-right text-bold text-mono">{formatNumber(p.total)}</td>
                    </tr>
                  ))}
                  {topProductData.length === 0 && (
                    <tr><td colSpan="4" className="text-center text-muted" style={{ padding: '40px' }}>ไม่มีข้อมูล</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
