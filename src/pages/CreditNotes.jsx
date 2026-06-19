import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import Modal from '../components/Common/Modal';
import { db, getNextCreditNoteNumber, reserveDocumentNumber } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateShort, formatDateThai, getToday, bahtText } from '../utils/helpers';
import {
  FilePlus, Search, Printer, Trash2, FileText, Eye,
  ArrowDownLeft, ArrowUpRight
} from 'lucide-react';

export default function CreditNotes() {
  const { showToast } = useApp();
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);

  // Form
  const [noteType, setNoteType] = useState('credit'); // credit | debit
  const [noteNumber, setNoteNumber] = useState('');
  const [numberEdited, setNumberEdited] = useState(false);
  const [noteDate, setNoteDate] = useState(getToday());
  const [refInvoice, setRefInvoice] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [reason, setReason] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const all = await db.creditNotes.toArray();
    setNotes(all.sort((a, b) => (b.id || 0) - (a.id || 0)));
    setInvoices(await db.invoices.toArray());
    const comp = await db.settings.get('company');
    if (comp) setCompany(comp.value);
  }

  const filtered = notes.filter(n => {
    const matchSearch = !search ||
      n.noteNumber?.toLowerCase().includes(search.toLowerCase()) ||
      n.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      n.refInvoiceNumber?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || n.type === typeFilter;
    return matchSearch && matchType;
  });

  async function openNew(type) {
    setNoteType(type);
    const num = await getNextCreditNoteNumber(type);
    setNoteNumber(num);
    setNumberEdited(false);
    setNoteDate(getToday());
    setRefInvoice('');
    setSelectedInvoice(null);
    setReason('');
    setAdjustAmount('');
    setItems([]);
    setShowModal(true);
  }

  function selectInvoice(invId) {
    const inv = invoices.find(i => i.id === parseInt(invId));
    setSelectedInvoice(inv || null);
    if (inv) {
      setItems(inv.items?.map(i => ({ ...i, adjusted: false })) || []);
    }
  }

  async function handleSave() {
    if (saving) return;
    if (!selectedInvoice) {
      showToast('กรุณาเลือกใบเสร็จอ้างอิง', 'error');
      return;
    }
    if (!adjustAmount || isNaN(adjustAmount)) {
      showToast('กรุณากรอกจำนวนเงินที่ปรับ', 'error');
      return;
    }
    setSaving(true);
    try {
      const finalNumber = numberEdited ? noteNumber : await reserveDocumentNumber(noteType);
      await db.creditNotes.add({
        noteNumber: finalNumber,
        date: noteDate,
        type: noteType,
        invoiceId: selectedInvoice.id,
        refInvoiceNumber: selectedInvoice.invoiceNumber,
        customerId: selectedInvoice.customerId,
        customerName: selectedInvoice.customerName,
        customerAddress: selectedInvoice.customerAddress,
        reason,
        originalAmount: selectedInvoice.grandTotal,
        adjustAmount: parseFloat(adjustAmount),
        newAmount: noteType === 'credit'
          ? selectedInvoice.grandTotal - parseFloat(adjustAmount)
          : selectedInvoice.grandTotal + parseFloat(adjustAmount),
        company: { ...company },
        createdAt: new Date().toISOString(),
      });
      showToast(`บันทึก${noteType === 'credit' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'}สำเร็จ`);
      setShowModal(false);
      loadData();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(note) {
    if (window.confirm(`ต้องการลบ ${note.noteNumber}?`)) {
      await db.creditNotes.delete(note.id);
      showToast('ลบสำเร็จ');
      loadData();
    }
  }

  function handlePrint(note) {
    const printWindow = window.open('', '_blank');
    const title = note.type === 'credit' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้';
    const titleEn = note.type === 'credit' ? 'Credit Note' : 'Debit Note';
    const company = note.company || {};

    printWindow.document.write(`<html><head><title>${title} ${note.noteNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Sarabun',sans-serif;padding:15mm;color:#1e293b;font-size:13px;line-height:1.6}@media print{@page{size:A4;margin:10mm}body{padding:0}}</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1e293b">
        <div><div style="font-size:22px;font-weight:800">${title}</div><div style="font-size:14px;color:#64748b">${titleEn}</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:700">${company.name || ''}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px">
        <div>
          <div style="font-weight:600">${note.customerName || '-'}</div>
          <div style="font-size:12px">${note.customerAddress || ''}</div>
        </div>
        <div style="text-align:right">
          <div>เลขที่: <strong>${note.noteNumber}</strong></div>
          <div>วันที่: <strong>${formatDateThai(note.date)}</strong></div>
          <div>อ้างอิงใบเสร็จ: <strong>${note.refInvoiceNumber}</strong></div>
        </div>
      </div>
      <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px">
        <div style="font-weight:700;margin-bottom:8px">เหตุผล:</div>
        <div>${note.reason || '-'}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:600">ยอดเดิม (ใบเสร็จ ${note.refInvoiceNumber})</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:600">${formatNumber(note.originalAmount)} บาท</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:600;color:${note.type === 'credit' ? '#dc2626' : '#059669'}">${note.type === 'credit' ? 'ลดหนี้' : 'เพิ่มหนี้'}</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:700;color:${note.type === 'credit' ? '#dc2626' : '#059669'}">${note.type === 'credit' ? '-' : '+'}${formatNumber(note.adjustAmount)} บาท</td></tr>
        <tr style="background:#1e293b;color:white"><td style="padding:10px;border:1px solid #334155;font-weight:700">ยอดสุทธิ</td><td style="padding:10px;border:1px solid #334155;text-align:right;font-weight:800;font-size:16px">${formatNumber(note.newAmount)} บาท</td></tr>
      </table>
      <div style="font-size:12px;color:#64748b;margin-top:8px">(${bahtText(note.newAmount)})</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:40px">
        <div style="text-align:center"><div style="border-bottom:1px dotted #94a3b8;padding-bottom:40px;margin-bottom:8px"></div><div style="font-size:12px;color:#64748b">ผู้ออกเอกสาร</div></div>
        <div style="text-align:center"><div style="border-bottom:1px dotted #94a3b8;padding-bottom:40px;margin-bottom:8px"></div><div style="font-size:12px;color:#64748b">ผู้อนุมัติ</div></div>
      </div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  return (
    <>
      <Header
        title="ใบลดหนี้ / ใบเพิ่มหนี้"
        subtitle={`ทั้งหมด ${notes.length} ใบ`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline" onClick={() => openNew('debit')}>
              <ArrowUpRight size={18} /> ใบเพิ่มหนี้
            </button>
            <button className="btn btn-primary" onClick={() => openNew('credit')}>
              <ArrowDownLeft size={18} /> ใบลดหนี้
            </button>
          </div>
        }
      />
      <div className="page-content">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div className="search-wrapper" style={{ flex: 1, maxWidth: '400px' }}>
            <Search size={18} />
            <input type="text" className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." />
          </div>
          <select className="form-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: '160px' }}>
            <option value="all">ทุกประเภท</option>
            <option value="credit">ใบลดหนี้</option>
            <option value="debit">ใบเพิ่มหนี้</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>วันที่</th>
                  <th>ประเภท</th>
                  <th>อ้างอิง</th>
                  <th>ลูกค้า</th>
                  <th className="text-right">จำนวนเงิน</th>
                  <th className="text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map(n => (
                  <tr key={n.id}>
                    <td style={{ fontFamily: 'var(--font-en)', fontWeight: 700, color: 'var(--color-primary-600)' }}>{n.noteNumber}</td>
                    <td>{formatDateShort(n.date)}</td>
                    <td><span className={`badge ${n.type === 'credit' ? 'badge-danger' : 'badge-success'}`}>{n.type === 'credit' ? 'ลดหนี้' : 'เพิ่มหนี้'}</span></td>
                    <td style={{ fontFamily: 'var(--font-en)', fontSize: '13px' }}>{n.refInvoiceNumber}</td>
                    <td>{n.customerName}</td>
                    <td className="text-right text-bold text-mono" style={{ color: n.type === 'credit' ? 'var(--color-danger-600)' : 'var(--color-success-600)' }}>
                      {n.type === 'credit' ? '-' : '+'}{formatNumber(n.adjustAmount)}
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handlePrint(n)}><Printer size={16} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(n)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="7"><div className="empty-state"><FileText size={48} /><p className="empty-state-title">ไม่พบเอกสาร</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={noteType === 'credit' ? 'สร้างใบลดหนี้' : 'สร้างใบเพิ่มหนี้'}
        size="lg"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">เลขที่</label>
            <input type="text" className="form-input" value={noteNumber} onChange={e => { setNoteNumber(e.target.value); setNumberEdited(true); }} style={{ fontFamily: 'var(--font-en)', fontWeight: 700 }} />
          </div>
          <div className="form-group">
            <label className="form-label">วันที่</label>
            <input type="date" className="form-input" value={noteDate} onChange={e => setNoteDate(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">อ้างอิงใบเสร็จ <span className="required">*</span></label>
          <select className="form-select" value={selectedInvoice?.id || ''} onChange={e => selectInvoice(e.target.value)}>
            <option value="">เลือกใบเสร็จ</option>
            {invoices.map(inv => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} — {inv.customerName || 'ไม่ระบุ'} — ฿{formatNumber(inv.grandTotal)}
              </option>
            ))}
          </select>
        </div>

        {selectedInvoice && (
          <div style={{ padding: '12px', background: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '13px' }}>
            <strong>{selectedInvoice.customerName}</strong> · ยอดเดิม: <strong className="text-mono">{formatNumber(selectedInvoice.grandTotal)} บาท</strong>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">เหตุผล <span className="required">*</span></label>
          <textarea className="form-textarea" value={reason} onChange={e => setReason(e.target.value)} placeholder={noteType === 'credit' ? 'เช่น สินค้าชำรุด, คืนสินค้า, คิดราคาผิด...' : 'เช่น เพิ่มค่าขนส่ง, เพิ่มค่าบริการ...'} />
        </div>

        <div className="form-group">
          <label className="form-label">จำนวนเงินที่{noteType === 'credit' ? 'ลด' : 'เพิ่ม'} (บาท) <span className="required">*</span></label>
          <input type="number" className="form-input" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ maxWidth: '250px' }} />
          {selectedInvoice && adjustAmount && !isNaN(adjustAmount) && (
            <p className="form-help">
              ยอดสุทธิ: <strong>{formatNumber(noteType === 'credit' ? selectedInvoice.grandTotal - parseFloat(adjustAmount) : selectedInvoice.grandTotal + parseFloat(adjustAmount))} บาท</strong>
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
