import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import Modal from '../components/Common/Modal';
import { db } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateShort, formatDateThai, bahtText, formatBranch } from '../utils/helpers';
import {
  Search, FileText, Eye, Printer, Trash2, Filter,
  CheckCircle, Clock, XCircle, Download, Edit2
} from 'lucide-react';

export default function InvoiceHistory() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast } = useApp();
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [paperSize, setPaperSize] = useState('A4');

  useEffect(() => { loadInvoices(); }, []);

  // Deep link: /invoices/:id opens that invoice's detail directly.
  useEffect(() => {
    if (id && invoices.length) {
      const target = invoices.find(inv => String(inv.id) === String(id));
      if (target) {
        setSelectedInvoice(target);
        setShowPreview(true);
      }
    }
  }, [id, invoices]);

  async function loadInvoices() {
    const all = await db.invoices.toArray();
    setInvoices(all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
    const printSetting = await db.settings.get('printSettings');
    if (printSetting?.value?.paperSize) setPaperSize(printSetting.value.paperSize);
  }

  async function changePaperSize(size) {
    setPaperSize(size);
    const cur = (await db.settings.get('printSettings'))?.value || {};
    await db.settings.put({ key: 'printSettings', value: { ...cur, paperSize: size } });
  }

  // Thermal (80/58mm) reprint of a saved invoice.
  function printThermal(target, w) {
    const width = w === 58 ? 58 : 80;
    const base = width === 58 ? 10 : 12;
    const company = target.company || {};
    const items = target.items || [];
    const title = target.type === 'tax_invoice' ? 'ใบกำกับภาษี' : target.type === 'delivery' ? 'ใบส่งของ' : 'ใบเสร็จรับเงิน';
    const itemLines = items.map((item, idx) => `
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span>${idx + 1}. ${item.description}</span><span>${formatNumber(item.total)}</span></div>
      <div style="font-size:10px;color:#666;padding-left:16px">${item.quantity} x ${formatNumber(item.unitPrice)}${item.discount > 0 ? ` -${formatNumber(item.discount)}` : ''}</div>
    `).join('');
    const pw = window.open('', '_blank');
    pw.document.write(`
      <html><head><title>${target.invoiceNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Sarabun',sans-serif;width:${width}mm;padding:4mm;font-size:${base}px;color:#000}.divider{border-top:1px dashed #333;margin:6px 0}@media print{@page{size:${width}mm auto;margin:0}body{padding:2mm}}</style>
      </head><body>
        <div style="text-align:center;font-weight:700;font-size:14px">${company.name || ''}</div>
        <div style="text-align:center;font-size:10px;color:#666">${company.address || ''}</div>
        <div style="text-align:center;font-size:10px">Tel: ${company.phone || ''}</div>
        <div class="divider"></div>
        <div style="text-align:center;font-weight:700">${title}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>เลขที่: ${target.invoiceNumber}</span><span>${formatDateThai(target.date)}</span></div>
        <div style="font-size:11px">ลูกค้า: ${target.customerName || '-'}</div>
        <div class="divider"></div>
        ${itemLines}
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between;font-weight:600"><span>รวม:</span><span>${formatNumber(target.subtotal)}</span></div>
        ${target.billDiscount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>ส่วนลดท้ายบิล:</span><span>-${formatNumber(target.billDiscount)}</span></div>` : ''}
        ${target.type === 'tax_invoice' ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>VAT ${target.vatRate}%:</span><span>${formatNumber(target.vatAmount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top:2px solid #000;margin-top:4px;padding-top:4px"><span>รวมทั้งสิ้น:</span><span>${formatNumber(target.grandTotal)} บาท</span></div>
        ${target.whtEnabled ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>หัก ณ ที่จ่าย ${target.whtRate}%:</span><span>-${formatNumber(target.whtAmount)}</span></div><div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top:1px solid #000;margin-top:2px;padding-top:2px"><span>ชำระสุทธิ:</span><span>${formatNumber(target.netPayable)} บาท</span></div>` : ''}
        <div style="font-size:10px;text-align:center;color:#666">(${bahtText(target.whtEnabled ? target.netPayable : target.grandTotal)})</div>
        ${target.paymentMethod === 'cash' && target.cashReceived > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>รับเงิน:</span><span>${formatNumber(target.cashReceived)}</span></div><div style="display:flex;justify-content:space-between;font-size:11px"><span>เงินทอน:</span><span>${formatNumber(target.changeDue)}</span></div>` : ''}
        <div class="divider"></div>
        <div style="text-align:center;font-size:10px;color:#666">ขอบคุณที่ใช้บริการ</div>
      </body></html>
    `);
    pw.document.close();
    setTimeout(() => pw.print(), 500);
  }

  const filtered = invoices.filter(inv => {
    const matchSearch = !search ||
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalAmount = filtered.reduce((s, inv) => s + (inv.grandTotal || 0), 0);

  async function handleDelete(inv) {
    if (window.confirm(`ต้องการลบใบเสร็จ ${inv.invoiceNumber} ใช่หรือไม่?`)) {
      await db.invoices.delete(inv.id);
      showToast('ลบใบเสร็จสำเร็จ');
      loadInvoices();
    }
  }

  async function toggleStatus(inv) {
    const newStatus = inv.status === 'paid' ? 'unpaid' : 'paid';
    await db.invoices.update(inv.id, { status: newStatus });
    showToast(`เปลี่ยนสถานะเป็น "${newStatus === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'}" สำเร็จ`);
    loadInvoices();
  }

  function viewInvoice(inv) {
    setSelectedInvoice(inv);
    setShowPreview(true);
  }

  function handlePrint(inv, size = paperSize) {
    const target = inv || selectedInvoice;
    if (!target) return;
    if (size === '80mm' || size === '58mm') return printThermal(target, size === '58mm' ? 58 : 80);

    const cfg = {
      A4: { page: 'A4', margin: '10mm', font: '13px' },
      A5: { page: 'A5', margin: '8mm', font: '11px' },
      Letter: { page: 'Letter', margin: '10mm', font: '13px' },
    }[size] || { page: 'A4', margin: '10mm', font: '13px' };

    const printWindow = window.open('', '_blank');
    const items = target.items || [];
    const company = target.company || {};
    const bank = target.bank || {};

    const docTitle = target.type === 'tax_invoice' ? 'ใบกำกับภาษี' : target.type === 'delivery' ? 'ใบส่งของ' : 'ใบเสร็จรับเงิน';
    const docTitleEn = target.type === 'tax_invoice' ? 'Tax Invoice' : target.type === 'delivery' ? 'Delivery Note' : 'Receipt';

    const itemRows = items.map((item, idx) => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${idx + 1}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0">${item.description}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${item.quantity}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right;font-family:Inter,sans-serif">${formatNumber(item.unitPrice)}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right;font-family:Inter,sans-serif">${item.discount > 0 ? formatNumber(item.discount) : '-'}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;font-family:Inter,sans-serif">${formatNumber(item.total)}</td>
      </tr>
    `).join('');

    const emptyRows = Array.from({ length: Math.max(0, 5 - items.length) }).map(() => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0">&nbsp;</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0"></td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0"></td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0"></td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0"></td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0"></td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${docTitle} ${target.invoiceNumber}</title>
          <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            body { font-family:'Sarabun',sans-serif; padding:${cfg.margin}; color:#1e293b; font-size:${cfg.font}; line-height:1.6; }
            table { width:100%; border-collapse:collapse; }
            @media print { @page { size:${cfg.page}; margin:${cfg.margin}; } body { padding:0; } }
          </style>
        </head>
        <body>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1e293b">
            <div>
              <div style="font-size:22px;font-weight:800">${docTitle}</div>
              <div style="font-size:14px;color:#64748b">${docTitleEn}${target.type === 'tax_invoice' ? ' · ต้นฉบับ (Original)' : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:18px;font-weight:700">${company.name || ''}</div>
              ${company.taxId ? `<div style="font-size:11px;color:#64748b">เลขประจำตัวผู้เสียภาษี ${company.taxId} (${formatBranch(company.branchCode)})</div>` : ''}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px">
            <div>
              <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:4px">ลูกค้า:</div>
              <div style="font-weight:600">${target.customerName || '-'}</div>
              <div style="font-size:12px;color:#475569">ที่อยู่: ${target.customerAddress || '-'}</div>
              ${target.customerTaxId ? `<div style="font-size:12px;color:#475569">เลขประจำตัวผู้เสียภาษี: ${target.customerTaxId} (${formatBranch(target.customerBranchCode)})</div>` : ''}
              ${target.customerPhone ? `<div style="font-size:12px">ผู้ติดต่อ: ${target.customerPhone}</div>` : ''}
            </div>
            <div style="text-align:right">
              <div style="margin-bottom:4px">
                <span style="color:#64748b;margin-right:8px">เลขที่:</span>
                <strong style="font-family:Inter,sans-serif">${target.invoiceNumber}</strong>
              </div>
              <div>
                <span style="color:#64748b;margin-right:8px">วันที่:</span>
                <strong>${formatDateThai(target.date)}</strong>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px">
            <div>
              <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:4px">ผู้ออก:</div>
              <div>${company.name || ''}</div>
              <div style="font-size:12px">ที่อยู่: ${company.address || ''}</div>
              ${company.taxId ? `<div style="font-size:12px">เลขประจำตัวผู้เสียภาษี: ${company.taxId} (${formatBranch(company.branchCode)})</div>` : ''}
            </div>
            <div>
              <div style="font-size:12px">จัดเตรียมโดย: <strong>${target.preparedBy || '-'}</strong></div>
              <div style="font-size:12px">เบอร์ติดต่อ: ${company.phone || ''}</div>
              <div style="font-size:12px">อีเมล: ${company.email || ''}</div>
            </div>
          </div>

          <table style="margin:16px 0">
            <thead>
              <tr>
                <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;text-align:center;border:1px solid #334155;width:50px">ลำดับที่</th>
                <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;text-align:center;border:1px solid #334155">รายละเอียด</th>
                <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;text-align:center;border:1px solid #334155;width:70px">จำนวน</th>
                <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;text-align:center;border:1px solid #334155;width:100px">ราคาต่อหน่วย</th>
                <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;text-align:center;border:1px solid #334155;width:80px">ส่วนลด</th>
                <th style="background:#1e293b;color:white;padding:8px 10px;font-size:12px;text-align:center;border:1px solid #334155;width:110px">รวมเป็นเงิน</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              ${emptyRows}
            </tbody>
          </table>

          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:12px;color:#64748b;max-width:50%">
              ${target.notes ? `<div><strong>หมายเหตุ:</strong> ${target.notes}</div>` : ''}
            </div>
            <div style="width:280px">
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0">
                <span>ราคารวมสินค้า (บาท)</span>
                <span style="font-family:Inter,sans-serif;font-weight:600">${formatNumber(target.subtotal)}</span>
              </div>
              ${target.billDiscount > 0 ? `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0">
                <span>ส่วนลดท้ายบิล</span>
                <span style="font-family:Inter,sans-serif;font-weight:600">-${formatNumber(target.billDiscount)}</span>
              </div>` : ''}
              ${target.type === 'tax_invoice' ? `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0">
                <span>ภาษีมูลค่าเพิ่ม ${target.vatRate}%</span>
                <span style="font-family:Inter,sans-serif;font-weight:600">${formatNumber(target.vatAmount)}</span>
              </div>` : ''}
              <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #1e293b;font-weight:800;font-size:15px">
                <span>จำนวนเงินรวมทั้งสิ้น</span>
                <span style="font-family:Inter,sans-serif">${formatNumber(target.grandTotal)}</span>
              </div>
              ${target.whtEnabled ? `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0">
                <span>หัก ณ ที่จ่าย ${target.whtRate}%</span>
                <span style="font-family:Inter,sans-serif;font-weight:600">-${formatNumber(target.whtAmount)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #1e293b;font-weight:800;font-size:15px">
                <span>ยอดชำระสุทธิ</span>
                <span style="font-family:Inter,sans-serif">${formatNumber(target.netPayable)}</span>
              </div>` : ''}
              <div style="font-size:12px;color:#64748b;text-align:right">
                (${bahtText(target.whtEnabled ? target.netPayable : target.grandTotal)})
              </div>
            </div>
          </div>

          <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px">
            <div style="font-weight:700;margin-bottom:4px">ข้อมูลการชำระเงิน:</div>
            ${target.paymentMethod === 'transfer' && bank.bankName ? `
              <div>- ชื่อบัญชี: ${bank.accountName}</div>
              <div>- ธนาคาร ${bank.bankName} เลขที่บัญชี ${bank.accountNumber}</div>
            ` : ''}
            ${target.paymentMethod === 'cash' ? '<div>- ชำระด้วยเงินสด</div>' : ''}
            ${target.paymentMethod === 'check' ? '<div>- ชำระด้วยเช็ค</div>' : ''}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:40px">
            <div style="text-align:center">
              <div style="border-bottom:1px dotted #94a3b8;padding-bottom:40px;margin-bottom:8px"></div>
              <div style="font-size:12px;color:#64748b">อนุมัติโดย</div>
            </div>
            <div style="text-align:center">
              <div style="border-bottom:1px dotted #94a3b8;padding-bottom:40px;margin-bottom:8px"></div>
              <div style="font-size:12px;color:#64748b">รับชำระเงิน</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  return (
    <>
      <Header
        title="ประวัติใบเสร็จ"
        subtitle={`ทั้งหมด ${invoices.length} ใบ`}
      />
      <div className="page-content">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ flex: 1, minWidth: '250px', maxWidth: '400px' }}>
            <Search size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="ค้นหาเลขที่ใบเสร็จ, ชื่อลูกค้า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: '160px' }}
          >
            <option value="all">ทุกสถานะ</option>
            <option value="paid">ชำระแล้ว</option>
            <option value="unpaid">ค้างชำระ</option>
          </select>
        </div>

        {/* Summary bar */}
        <div style={{
          display: 'flex', gap: '24px', padding: '16px 20px',
          background: 'white', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-gray-200)', marginBottom: '16px',
          fontSize: '14px'
        }}>
          <span>พบ <strong>{filtered.length}</strong> ใบ</span>
          <span>ยอดรวม: <strong className="text-mono">{formatNumber(totalAmount)} บาท</strong></span>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>วันที่</th>
                  <th>ลูกค้า</th>
                  <th>ประเภท</th>
                  <th className="text-right">ยอดรวม</th>
                  <th className="text-center">สถานะ</th>
                  <th className="text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'var(--font-en)', fontWeight: 700, fontSize: '13px', color: 'var(--color-primary-600)' }}>
                      {inv.invoiceNumber}
                    </td>
                    <td>{formatDateShort(inv.date)}</td>
                    <td style={{ fontWeight: 600 }}>{inv.customerName || '-'}</td>
                    <td>
                      <span className={`badge ${inv.type === 'tax_invoice' ? 'badge-primary' : inv.type === 'delivery' ? 'badge-warning' : 'badge-success'}`}>
                        {inv.type === 'tax_invoice' ? 'ใบกำกับภาษี' : inv.type === 'delivery' ? 'ใบส่งของ' : 'ใบเสร็จ'}
                      </span>
                    </td>
                    <td className="text-right text-bold text-mono">{formatNumber(inv.grandTotal)}</td>
                    <td className="text-center">
                      <button
                        className={`badge ${inv.status === 'paid' ? 'badge-success' : 'badge-warning'}`}
                        onClick={() => toggleStatus(inv)}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="คลิกเพื่อเปลี่ยนสถานะ"
                      >
                        {inv.status === 'paid' ? '✅ ชำระแล้ว' : '⏳ ค้างชำระ'}
                      </button>
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => viewInvoice(inv)} title="ดู">
                          <Eye size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/create-invoice', { state: { editId: inv.id } })} title="แก้ไข">
                          <Edit2 size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handlePrint(inv)} title="พิมพ์">
                          <Printer size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(inv)} title="ลบ">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7">
                      <div className="empty-state">
                        <FileText size={48} />
                        <p className="empty-state-title">ไม่พบใบเสร็จ</p>
                        <p className="empty-state-text">
                          {search ? 'ลองค้นหาด้วยคำอื่น' : 'ยังไม่มีใบเสร็จ เริ่มสร้างใบเสร็จใหม่'}
                        </p>
                        {!search && (
                          <button className="btn btn-primary" onClick={() => navigate('/create-invoice')}>
                            สร้างใบเสร็จใหม่
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={showPreview}
          onClose={() => { setShowPreview(false); setSelectedInvoice(null); }}
          title={`ใบเสร็จ ${selectedInvoice.invoiceNumber}`}
          size="xl"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => { setShowPreview(false); setSelectedInvoice(null); }}>ปิด</button>
              <select
                className="form-select"
                value={paperSize}
                onChange={e => changePaperSize(e.target.value)}
                style={{ width: 'auto', padding: '8px 28px 8px 12px' }}
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
                <option value="80mm">ใบเสร็จย่อ 80mm</option>
                <option value="58mm">ใบเสร็จย่อ 58mm</option>
              </select>
              <button className="btn btn-accent" onClick={() => handlePrint()}>
                <Printer size={18} /> พิมพ์ ({paperSize})
              </button>
            </>
          }
        >
          <div className="invoice-paper" style={{ fontSize: '13px', lineHeight: '1.6' }}>
            {/* Simplified preview */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #1e293b' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800 }}>
                  {selectedInvoice.type === 'tax_invoice' ? 'ใบกำกับภาษี' : 'ใบเสร็จรับเงิน'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{selectedInvoice.company?.name}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <strong>ลูกค้า:</strong> {selectedInvoice.customerName || '-'}<br />
                <span style={{ fontSize: '12px' }}>ที่อยู่: {selectedInvoice.customerAddress || '-'}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>เลขที่: <strong>{selectedInvoice.invoiceNumber}</strong></div>
                <div>วันที่: <strong>{formatDateThai(selectedInvoice.date)}</strong></div>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
              <thead>
                <tr>
                  <th style={{ background: '#1e293b', color: 'white', padding: '6px 8px', fontSize: '11px', border: '1px solid #334155' }}>#</th>
                  <th style={{ background: '#1e293b', color: 'white', padding: '6px 8px', fontSize: '11px', border: '1px solid #334155' }}>รายละเอียด</th>
                  <th style={{ background: '#1e293b', color: 'white', padding: '6px 8px', fontSize: '11px', border: '1px solid #334155' }}>จำนวน</th>
                  <th style={{ background: '#1e293b', color: 'white', padding: '6px 8px', fontSize: '11px', border: '1px solid #334155' }}>ราคา</th>
                  <th style={{ background: '#1e293b', color: 'white', padding: '6px 8px', fontSize: '11px', border: '1px solid #334155' }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {(selectedInvoice.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{item.description}</td>
                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'right' }}>{formatNumber(item.unitPrice)}</td>
                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600 }}>{formatNumber(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: '12px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800 }}>
                รวมทั้งสิ้น: {formatNumber(selectedInvoice.grandTotal)} บาท
              </div>
              {selectedInvoice.whtEnabled && (
                <>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    หัก ณ ที่จ่าย {selectedInvoice.whtRate}%: -{formatNumber(selectedInvoice.whtAmount)} บาท
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800 }}>
                    ยอดชำระสุทธิ: {formatNumber(selectedInvoice.netPayable)} บาท
                  </div>
                </>
              )}
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                ({bahtText(selectedInvoice.whtEnabled ? selectedInvoice.netPayable : selectedInvoice.grandTotal)})
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
