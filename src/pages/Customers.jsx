import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import Modal from '../components/Common/Modal';
import { db, getNextCustomerCode } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateShort } from '../utils/helpers';
import { Plus, Search, Edit2, Trash2, Eye, Users, Phone, MapPin } from 'lucide-react';

export default function Customers() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [allInvoices, setAllInvoices] = useState([]);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [form, setForm] = useState({
    code: '', name: '', shopName: '', taxId: '', branchCode: '',
    address: '', phone: '', email: '', notes: ''
  });

  useEffect(() => { loadCustomers(); }, []);

  async function loadCustomers() {
    const all = await db.customers.toArray();
    // Calculate outstanding for each customer
    const invoices = await db.invoices.toArray();
    setAllInvoices(invoices);
    const enriched = all.map(c => {
      const custInvoices = invoices.filter(inv => inv.customerId === c.id);
      const totalPurchase = custInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
      const unpaid = custInvoices.filter(inv => inv.status === 'unpaid')
        .reduce((s, inv) => s + (inv.grandTotal || 0), 0);
      return { ...c, totalPurchase, unpaidAmount: unpaid };
    });
    setCustomers(enriched);
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || 
      c.name?.toLowerCase().includes(q) ||
      c.shopName?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.code?.toLowerCase().includes(q);
  });

  async function openAdd() {
    const code = await getNextCustomerCode();
    setForm({ code, name: '', shopName: '', taxId: '', branchCode: '', address: '', phone: '', email: '', notes: '' });
    setEditingCustomer(null);
    setShowModal(true);
  }

  function openEdit(customer) {
    setForm({
      code: customer.code || '',
      name: customer.name || '',
      shopName: customer.shopName || '',
      taxId: customer.taxId || '',
      branchCode: customer.branchCode || '',
      address: customer.address || '',
      phone: customer.phone || '',
      email: customer.email || '',
      notes: customer.notes || '',
    });
    setEditingCustomer(customer);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast('กรุณากรอกชื่อลูกค้า', 'error');
      return;
    }
    try {
      if (editingCustomer) {
        await db.customers.update(editingCustomer.id, { ...form, updatedAt: new Date().toISOString() });
        showToast('แก้ไขข้อมูลลูกค้าสำเร็จ');
      } else {
        await db.customers.add({ ...form, createdAt: new Date().toISOString() });
        showToast('เพิ่มลูกค้าสำเร็จ');
      }
      setShowModal(false);
      loadCustomers();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
  }

  async function handleDelete(customer) {
    if (window.confirm(`ต้องการลบลูกค้า "${customer.name}" ใช่หรือไม่?`)) {
      await db.customers.delete(customer.id);
      showToast('ลบลูกค้าสำเร็จ');
      loadCustomers();
    }
  }

  return (
    <>
      <Header
        title="จัดการลูกค้า"
        subtitle={`ทั้งหมด ${customers.length} ราย`}
        actions={
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} /> เพิ่มลูกค้า
          </button>
        }
      />
      <div className="page-content">
        {/* Search */}
        <div style={{ marginBottom: '20px' }}>
          <div className="search-wrapper" style={{ maxWidth: '400px' }}>
            <Search size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="ค้นหาชื่อ, ร้าน, เบอร์โทร..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อลูกค้า</th>
                  <th>ชื่อร้าน</th>
                  <th>เบอร์โทร</th>
                  <th className="text-right">ยอดซื้อรวม</th>
                  <th className="text-right">ค้างชำระ</th>
                  <th>ซื้อล่าสุด</th>
                  <th className="text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--font-en)', fontWeight: 600, fontSize: '13px', color: 'var(--color-primary-600)' }}>
                      {c.code}
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.shopName || '-'}</td>
                    <td style={{ fontFamily: 'var(--font-en)' }}>{c.phone || '-'}</td>
                    <td className="text-right text-mono">{formatNumber(c.totalPurchase)}</td>
                    <td className="text-right">
                      {c.unpaidAmount > 0 ? (
                        <span className="text-danger text-bold text-mono">{formatNumber(c.unpaidAmount)}</span>
                      ) : (
                        <span className="text-success">-</span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>
                      {c.lastPurchaseAt ? formatDateShort(c.lastPurchaseAt) : '-'}
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewingCustomer(c)} title="ดูประวัติ">
                          <Eye size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)} title="แก้ไข">
                          <Edit2 size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c)} title="ลบ">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8">
                      <div className="empty-state">
                        <Users size={48} />
                        <p className="empty-state-title">ไม่พบลูกค้า</p>
                        <p className="empty-state-text">
                          {search ? 'ลองค้นหาด้วยคำอื่น' : 'เพิ่มลูกค้าคนแรกของคุณ'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCustomer ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}
        size="lg"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingCustomer ? 'บันทึก' : 'เพิ่มลูกค้า'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">รหัสลูกค้า</label>
            <input type="text" className="form-input" value={form.code} readOnly
              style={{ background: 'var(--color-gray-50)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">เลขประจำตัวผู้เสียภาษี / สาขา</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" className="form-input" value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                placeholder="0000000000000" maxLength={13} style={{ flex: 1 }} />
              <input type="text" className="form-input" value={form.branchCode}
                onChange={(e) => setForm({ ...form, branchCode: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                placeholder="สาขา" maxLength={5} style={{ width: '90px' }} title="รหัสสาขา (เว้นว่าง = สำนักงานใหญ่)" />
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">ชื่อลูกค้า <span className="required">*</span></label>
            <input type="text" className="form-input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ชื่อ-นามสกุล หรือ ชื่อบริษัท" />
          </div>
          <div className="form-group">
            <label className="form-label">ชื่อร้าน</label>
            <input type="text" className="form-input" value={form.shopName}
              onChange={(e) => setForm({ ...form, shopName: e.target.value })}
              placeholder="ชื่อร้านค้า" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">ที่อยู่</label>
          <textarea className="form-textarea" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="ที่อยู่สำหรับออกใบเสร็จ" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">เบอร์โทร</label>
            <input type="tel" className="form-input" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0xx-xxx-xxxx" />
          </div>
          <div className="form-group">
            <label className="form-label">อีเมล</label>
            <input type="email" className="form-input" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@example.com" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">หมายเหตุ</label>
          <textarea className="form-textarea" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" rows={2} />
        </div>
      </Modal>

      {/* Customer history */}
      <Modal
        isOpen={!!viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        title={viewingCustomer ? `ประวัติลูกค้า: ${viewingCustomer.name}` : ''}
        size="lg"
        footer={<button className="btn btn-outline" onClick={() => setViewingCustomer(null)}>ปิด</button>}
      >
        {viewingCustomer && (() => {
          const invs = allInvoices
            .filter(inv => (viewingCustomer.id && inv.customerId === viewingCustomer.id) || inv.customerName === viewingCustomer.name)
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
          const total = invs.reduce((s, i) => s + (i.grandTotal || 0), 0);
          const unpaid = invs.filter(i => i.status === 'unpaid').reduce((s, i) => s + (i.grandTotal || 0), 0);
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '16px', padding: '12px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)' }}>
                <div><strong>รหัส:</strong> {viewingCustomer.code || '-'}</div>
                <div><strong>เบอร์โทร:</strong> {viewingCustomer.phone || '-'}</div>
                <div><strong>เลขผู้เสียภาษี:</strong> {viewingCustomer.taxId || '-'}</div>
                <div><strong>ซื้อล่าสุด:</strong> {viewingCustomer.lastPurchaseAt ? formatDateShort(viewingCustomer.lastPurchaseAt) : '-'}</div>
                <div style={{ gridColumn: '1/-1' }}><strong>ที่อยู่:</strong> {viewingCustomer.address || '-'}</div>
              </div>
              <div className="stats-grid" style={{ marginBottom: '16px' }}>
                <div className="stat-card"><div className="stat-info"><div className="stat-label">จำนวนใบเสร็จ</div><div className="stat-value">{invs.length}</div></div></div>
                <div className="stat-card"><div className="stat-info"><div className="stat-label">ยอดซื้อรวม</div><div className="stat-value">{formatNumber(total, 0)}</div></div></div>
                <div className="stat-card"><div className="stat-info"><div className="stat-label">ค้างชำระ</div><div className="stat-value" style={{ color: unpaid > 0 ? 'var(--color-danger-600)' : 'inherit' }}>{formatNumber(unpaid, 0)}</div></div></div>
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>เลขที่</th>
                      <th>วันที่</th>
                      <th className="text-right">ยอด</th>
                      <th className="text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invs.length > 0 ? invs.map(inv => (
                      <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <td style={{ fontFamily: 'var(--font-en)', fontWeight: 600, fontSize: '13px', color: 'var(--color-primary-600)' }}>{inv.invoiceNumber}</td>
                        <td>{formatDateShort(inv.date)}</td>
                        <td className="text-right text-mono">{formatNumber(inv.grandTotal)}</td>
                        <td className="text-center">
                          <span className={`badge ${inv.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                            {inv.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="4" className="text-center text-muted" style={{ padding: '32px' }}>ยังไม่มีประวัติการซื้อ</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </Modal>
    </>
  );
}
