import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import Modal from '../components/Common/Modal';
import BarcodeScanner from '../components/Scanner/BarcodeScanner';
import { db, getNextQuotationNumber, reserveDocumentNumber } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateThai, formatDateShort, getToday, bahtText } from '../utils/helpers';
import { printHtml } from '../utils/print';
import {
  FilePlus, ScanBarcode, Plus, Trash2, Search, Save,
  Printer, Eye, FileText, ArrowRight, Edit2, Clock, CheckCircle, XCircle
} from 'lucide-react';

export default function Quotations() {
  const navigate = useNavigate();
  const { showToast, appConfirm } = useApp();

  const [quotations, setQuotations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state
  const [quotationNumber, setQuotationNumber] = useState('');
  const [numberEdited, setNumberEdited] = useState(false);
  const [quotationDate, setQuotationDate] = useState(getToday());
  const [validUntil, setValidUntil] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [items, setItems] = useState([{ id: 1, description: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 }]);
  const [productSearch, setProductSearch] = useState('');
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [notes, setNotes] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Company settings
  const [company, setCompany] = useState({});
  const [invoiceSettings, setInvoiceSettings] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setQuotations((await db.quotations.toArray()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
    const comp = await db.settings.get('company');
    if (comp) setCompany(comp.value);
    const inv = await db.settings.get('invoice');
    if (inv) setInvoiceSettings(inv.value);
    const lastPrepared = await db.settings.get('lastPreparedBy');
    if (lastPrepared) setPreparedBy(lastPrepared.value);
  }

  const filtered = quotations.filter(q => {
    const matchSearch = !search ||
      q.quotationNumber?.toLowerCase().includes(search.toLowerCase()) ||
      q.customerName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Default valid until: 30 days
  useEffect(() => {
    if (!validUntil) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setValidUntil(d.toISOString().split('T')[0]);
    }
  }, []);

  async function openNewForm() {
    const num = await getNextQuotationNumber();
    setQuotationNumber(num);
    setNumberEdited(false);
    setQuotationDate(getToday());
    setCustomerSearch('');
    setSelectedCustomer(null);
    setItems([{ id: 1, description: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 }]);
    setNotes('');
    setEditingId(null);
    setShowForm(true);
  }

  async function handleCustomerSearch(value) {
    setCustomerSearch(value);
    setSelectedCustomer(null);
    if (value.length >= 1) {
      const all = await db.customers.toArray();
      const matches = all.filter(c =>
        c.name?.toLowerCase().includes(value.toLowerCase()) ||
        c.shopName?.toLowerCase().includes(value.toLowerCase()) ||
        c.phone?.includes(value)
      ).slice(0, 10);
      setCustomerSuggestions(matches);
      setShowCustomerDropdown(matches.length > 0);
    } else {
      setShowCustomerDropdown(false);
    }
  }

  function selectCustomer(customer) {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  }

  function addItem() {
    setItems([...items, { id: Date.now(), description: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 }]);
  }

  function updateItem(id, field, value) {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (['quantity', 'unitPrice', 'discount'].includes(field)) {
          const qty = parseFloat(updated.quantity) || 0;
          const price = parseFloat(updated.unitPrice) || 0;
          const disc = parseFloat(updated.discount) || 0;
          updated.total = (qty * price) - disc;
        }
        return updated;
      }
      return item;
    }));
  }

  function removeItem(id) {
    if (items.length <= 1) return;
    setItems(items.filter(i => i.id !== id));
  }

  async function handleProductSearch(value) {
    setProductSearch(value);
    if (value.trim().length >= 1) {
      const all = await db.products.toArray();
      const q = value.toLowerCase();
      const matches = all.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.includes(value) ||
        p.code?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      ).slice(0, 10);
      setProductSuggestions(matches);
      setShowProductDropdown(matches.length > 0);
    } else {
      setShowProductDropdown(false);
    }
  }

  function selectProduct(product) {
    const newItem = {
      id: Date.now(),
      description: product.name + (product.description ? ` - ${product.description}` : ''),
      quantity: 1,
      unitPrice: product.price || 0,
      discount: 0,
      total: product.price || 0,
      productId: product.id,
    };
    setItems([...items.filter(i => i.description), newItem]);
    setProductSearch('');
    setShowProductDropdown(false);
  }

  async function handleBarcodeScan(barcode) {
    const product = await db.products.where('barcode').equals(barcode).first();
    if (product) {
      const newItem = {
        id: Date.now(), description: product.name, quantity: 1,
        unitPrice: product.price, discount: 0, total: product.price,
      };
      setItems([...items.filter(i => i.description), newItem]);
      setShowScanner(false);
      showToast(`เพิ่ม "${product.name}" สำเร็จ`);
    } else {
      showToast(`ไม่พบสินค้าบาร์โค้ด: ${barcode}`, 'warning');
    }
  }

  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

  async function handleSave() {
    if (saving) return;
    if (items.filter(i => i.description).length === 0) {
      showToast('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ', 'error');
      return;
    }
    setSaving(true);
    try {
      // Reserve the running number atomically at save time (unless the user
      // typed a custom one) so concurrent saves can't collide.
      const finalNumber = editingId
        ? quotationNumber
        : (numberEdited ? quotationNumber : await reserveDocumentNumber('quotation'));

      const data = {
        quotationNumber: finalNumber, date: quotationDate, validUntil,
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || customerSearch,
        customerAddress: selectedCustomer?.address || '',
        customerPhone: selectedCustomer?.phone || '',
        items: items.filter(i => i.description),
        subtotal, grandTotal: subtotal,
        preparedBy, notes,
        status: 'pending', // pending, accepted, rejected, converted
        company: { ...company },
        createdAt: new Date().toISOString(),
      };

      if (editingId) {
        await db.quotations.update(editingId, data);
        showToast('แก้ไขใบเสนอราคาสำเร็จ');
      } else {
        await db.quotations.add(data);
        showToast('บันทึกใบเสนอราคาสำเร็จ');
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function convertToInvoice(qt) {
    try {
      const bank = await db.settings.get('bank');
      const invNum = await reserveDocumentNumber('invoice');

      await db.invoices.add({
        invoiceNumber: invNum,
        date: getToday(),
        type: 'receipt',
        customerId: qt.customerId,
        customerName: qt.customerName,
        customerAddress: qt.customerAddress,
        customerPhone: qt.customerPhone,
        items: qt.items,
        subtotal: qt.subtotal,
        vatRate: 0,
        vatAmount: 0,
        grandTotal: qt.grandTotal,
        preparedBy: qt.preparedBy,
        paymentMethod: 'cash',
        status: 'unpaid',
        notes: `จากใบเสนอราคา ${qt.quotationNumber}`,
        company: qt.company,
        bank: bank?.value || {},
        fromQuotation: qt.quotationNumber,
        createdAt: new Date().toISOString(),
      });

      // Mark quotation as converted
      await db.quotations.update(qt.id, { status: 'converted' });

      showToast(`แปลงเป็นใบเสร็จ ${invNum} สำเร็จ`);
      loadData();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
  }

  async function updateStatus(qt, status) {
    await db.quotations.update(qt.id, { status });
    showToast(`เปลี่ยนสถานะเป็น "${statusLabel(status)}" สำเร็จ`);
    loadData();
  }

  function statusLabel(s) {
    const map = { pending: 'รอตอบรับ', accepted: 'ตอบรับแล้ว', rejected: 'ปฏิเสธ', converted: 'แปลงเป็นใบเสร็จแล้ว' };
    return map[s] || s;
  }

  function statusBadge(s) {
    const map = { pending: 'badge-warning', accepted: 'badge-success', rejected: 'badge-danger', converted: 'badge-primary' };
    return map[s] || 'badge-primary';
  }

  async function handleDelete(qt) {
    if (await appConfirm(`ต้องการลบใบเสนอราคา ${qt.quotationNumber}?`, { danger: true, okLabel: 'ลบ' })) {
      await db.quotations.delete(qt.id);
      showToast('ลบสำเร็จ');
      loadData();
    }
  }

  function handlePrint(qt) {
    const items = qt.items || [];
    const company = qt.company || {};

    const itemRows = items.map((item, idx) => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${idx + 1}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0">${item.description}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${item.quantity}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right">${formatNumber(item.unitPrice)}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right">${item.discount > 0 ? formatNumber(item.discount) : '-'}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600">${formatNumber(item.total)}</td>
      </tr>
    `).join('');

    printHtml(`<html><head><title>ใบเสนอราคา ${qt.quotationNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Sarabun',sans-serif;padding:15mm;color:#1e293b;font-size:13px;line-height:1.6}table{width:100%;border-collapse:collapse}@media print{@page{size:A4;margin:10mm}body{padding:0}}</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1e293b">
        <div><div style="font-size:22px;font-weight:800">ใบเสนอราคา</div><div style="font-size:14px;color:#64748b">Quotation</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:700">${company.name || ''}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px">
        <div>
          <div style="font-size:12px;font-weight:700;color:#64748b">ลูกค้า:</div>
          <div style="font-weight:600">${qt.customerName || '-'}</div>
          <div style="font-size:12px">ที่อยู่: ${qt.customerAddress || '-'}</div>
        </div>
        <div style="text-align:right">
          <div>เลขที่: <strong>${qt.quotationNumber}</strong></div>
          <div>วันที่: <strong>${formatDateThai(qt.date)}</strong></div>
          <div>ใช้ได้ถึง: <strong>${formatDateThai(qt.validUntil)}</strong></div>
        </div>
      </div>
      <table style="margin:16px 0">
        <thead><tr>
          <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;border:1px solid #334155;width:50px">ลำดับ</th>
          <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;border:1px solid #334155">รายละเอียด</th>
          <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;border:1px solid #334155;width:70px">จำนวน</th>
          <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;border:1px solid #334155;width:100px">ราคา/หน่วย</th>
          <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;border:1px solid #334155;width:80px">ส่วนลด</th>
          <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;border:1px solid #334155;width:110px">รวม</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;margin-top:16px">
        <div style="font-size:18px;font-weight:800">รวมทั้งสิ้น: ${formatNumber(qt.grandTotal)} บาท</div>
        <div style="font-size:12px;color:#64748b">(${bahtText(qt.grandTotal)})</div>
      </div>
      ${qt.notes ? `<div style="margin-top:16px;font-size:12px"><strong>หมายเหตุ:</strong> ${qt.notes}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:40px">
        <div style="text-align:center"><div style="border-bottom:1px dotted #94a3b8;padding-bottom:40px;margin-bottom:8px"></div><div style="font-size:12px;color:#64748b">ผู้เสนอราคา</div></div>
        <div style="text-align:center"><div style="border-bottom:1px dotted #94a3b8;padding-bottom:40px;margin-bottom:8px"></div><div style="font-size:12px;color:#64748b">ผู้อนุมัติ</div></div>
      </div>
    </body></html>`);
  }

  // === MAIN RENDER ===
  if (showForm) {
    return (
      <>
        <Header
          title={editingId ? 'แก้ไขใบเสนอราคา' : 'สร้างใบเสนอราคาใหม่'}
          subtitle={quotationNumber}
          actions={
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={18} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          }
        />
        <div className="page-content">
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gap: '20px' }}>
            {/* Header info */}
            <div className="card">
              <div className="card-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">เลขที่ใบเสนอราคา</label>
                    <input type="text" className="form-input" value={quotationNumber} onChange={e => { setQuotationNumber(e.target.value); setNumberEdited(true); }} style={{ fontFamily: 'var(--font-en)', fontWeight: 700 }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">วันที่</label>
                    <input type="date" className="form-input" value={quotationDate} onChange={e => setQuotationDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ใช้ได้ถึง</label>
                    <input type="date" className="form-input" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Customer */}
            <div className="card">
              <div className="card-header"><h3 className="card-title">👤 ข้อมูลลูกค้า</h3></div>
              <div className="card-body">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">ชื่อลูกค้า</label>
                  <div className="search-wrapper">
                    <Search size={18} />
                    <input type="text" className="search-input" value={customerSearch}
                      onChange={e => handleCustomerSearch(e.target.value)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      placeholder="พิมพ์ชื่อลูกค้า..." />
                  </div>
                  {showCustomerDropdown && (
                    <div className="autocomplete-dropdown">
                      {customerSuggestions.map(c => (
                        <div key={c.id} className="autocomplete-item" onMouseDown={() => selectCustomer(c)}>
                          <div className="autocomplete-item-name">{c.name}</div>
                          <div className="autocomplete-item-detail">{c.shopName && `🏪 ${c.shopName} · `}{c.phone && `📞 ${c.phone}`}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedCustomer && (
                  <div style={{ padding: '12px', background: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    <strong>{selectedCustomer.name}</strong> {selectedCustomer.shopName && `· ${selectedCustomer.shopName}`}<br />
                    {selectedCustomer.address && <span>📍 {selectedCustomer.address}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">📦 รายการ</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => setShowScanner(!showScanner)}><ScanBarcode size={16} /> สแกน</button>
                  <button className="btn btn-sm btn-primary" onClick={addItem}><Plus size={16} /> เพิ่ม</button>
                </div>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {showScanner && (
                  <div style={{ padding: '16px', borderBottom: '1px solid var(--color-gray-100)' }}>
                    <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />
                  </div>
                )}
                {/* Quick add saved product by name */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--color-gray-100)' }}>
                  <div style={{ position: 'relative' }}>
                    <div className="search-wrapper">
                      <Search size={18} />
                      <input
                        type="text"
                        className="search-input"
                        value={productSearch}
                        onChange={e => handleProductSearch(e.target.value)}
                        onFocus={() => productSearch && handleProductSearch(productSearch)}
                        onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                        placeholder="ค้นหาสินค้าที่บันทึกไว้ (พิมพ์ชื่อ / บาร์โค้ด / รหัส) แล้วกดเลือก..."
                      />
                    </div>
                    {showProductDropdown && (
                      <div className="autocomplete-dropdown">
                        {productSuggestions.map(p => (
                          <div key={p.id} className="autocomplete-item" onMouseDown={() => selectProduct(p)}>
                            <div className="autocomplete-item-name">{p.name}</div>
                            <div className="autocomplete-item-detail">
                              {p.code && `${p.code} · `}฿{formatNumber(p.price || 0)}
                              {p.stock != null && ` · คงเหลือ ${p.stock}${p.unit ? ` ${p.unit}` : ''}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>#</th>
                        <th>รายละเอียด</th>
                        <th style={{ width: '90px' }}>จำนวน</th>
                        <th style={{ width: '120px' }}>ราคา/หน่วย</th>
                        <th style={{ width: '100px' }}>ส่วนลด</th>
                        <th style={{ width: '120px' }} className="text-right">รวม</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.id}>
                          <td className="text-center">{idx + 1}</td>
                          <td><input type="text" className="form-input" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="ชื่อสินค้า" style={{ border: 'none', padding: '4px 8px', background: 'transparent' }} /></td>
                          <td><input type="number" className="form-input" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} min="1" style={{ textAlign: 'center', padding: '4px 8px' }} /></td>
                          <td><input type="number" className="form-input" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', e.target.value)} min="0" step="0.01" style={{ textAlign: 'right', padding: '4px 8px' }} /></td>
                          <td><input type="number" className="form-input" value={item.discount} onChange={e => updateItem(item.id, 'discount', e.target.value)} min="0" style={{ textAlign: 'right', padding: '4px 8px' }} /></td>
                          <td className="text-right text-bold text-mono">{formatNumber(item.total)}</td>
                          <td>{items.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}><Trash2 size={14} /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '2px solid var(--color-gray-200)', textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800 }}>รวมทั้งสิ้น: {formatNumber(subtotal)} บาท</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>({bahtText(subtotal)})</div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="card">
              <div className="card-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">ผู้จัดทำ</label>
                    <input type="text" className="form-input" value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="ชื่อผู้จัดทำ" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">หมายเหตุ</label>
                    <input type="text" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="เงื่อนไข / หมายเหตุ" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // === LIST VIEW ===
  return (
    <>
      <Header
        title="ใบเสนอราคา"
        subtitle={`ทั้งหมด ${quotations.length} ใบ`}
        actions={<button className="btn btn-primary" onClick={openNewForm}><FilePlus size={18} /> สร้างใบเสนอราคา</button>}
      />
      <div className="page-content">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ flex: 1, minWidth: '250px', maxWidth: '400px' }}>
            <Search size={18} />
            <input type="text" className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขที่ / ชื่อลูกค้า..." />
          </div>
          <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '160px' }}>
            <option value="all">ทุกสถานะ</option>
            <option value="pending">รอตอบรับ</option>
            <option value="accepted">ตอบรับแล้ว</option>
            <option value="rejected">ปฏิเสธ</option>
            <option value="converted">แปลงแล้ว</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>วันที่</th>
                  <th>ลูกค้า</th>
                  <th>ใช้ได้ถึง</th>
                  <th className="text-right">ยอดรวม</th>
                  <th className="text-center">สถานะ</th>
                  <th className="text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map(qt => (
                  <tr key={qt.id}>
                    <td style={{ fontFamily: 'var(--font-en)', fontWeight: 700, color: 'var(--color-primary-600)' }}>{qt.quotationNumber}</td>
                    <td>{formatDateShort(qt.date)}</td>
                    <td style={{ fontWeight: 600 }}>{qt.customerName || '-'}</td>
                    <td>{formatDateShort(qt.validUntil)}</td>
                    <td className="text-right text-bold text-mono">{formatNumber(qt.grandTotal)}</td>
                    <td className="text-center"><span className={`badge ${statusBadge(qt.status)}`}>{statusLabel(qt.status)}</span></td>
                    <td className="text-center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        {qt.status === 'pending' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(qt, 'accepted')} title="ตอบรับ"><CheckCircle size={16} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(qt, 'rejected')} title="ปฏิเสธ"><XCircle size={16} /></button>
                          </>
                        )}
                        {(qt.status === 'accepted' || qt.status === 'pending') && (
                          <button className="btn btn-ghost btn-sm" onClick={() => convertToInvoice(qt)} title="แปลงเป็นใบเสร็จ"><ArrowRight size={16} /></button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => handlePrint(qt)} title="พิมพ์"><Printer size={16} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(qt)} title="ลบ"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="7">
                    <div className="empty-state">
                      <FileText size={48} />
                      <p className="empty-state-title">ไม่พบใบเสนอราคา</p>
                      <p className="empty-state-text">{search ? 'ลองค้นหาด้วยคำอื่น' : 'สร้างใบเสนอราคาใบแรกของคุณ'}</p>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
