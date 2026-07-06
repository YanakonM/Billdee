import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import Modal from '../components/Common/Modal';
import { db, updateStock } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateShort, formatDateThai, bahtText, formatBranch, escapeHtml } from '../utils/helpers';
import { PAPER_SIZE_OPTIONS, getPaperConfig, isDotMatrixPaper, printHtml } from '../utils/print';
import {
  Search, FileText, Eye, Printer, Trash2, Filter,
  CheckCircle, Clock, XCircle, Download, Edit2
} from 'lucide-react';

export default function InvoiceHistory() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast, appConfirm } = useApp();
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all'); // all | manual | quotation
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
      } else {
        // Stale/unknown id (e.g. after a restore) — say so instead of silence.
        showToast('ไม่พบใบเสร็จที่ระบุ', 'warning');
        navigate('/invoices', { replace: true });
      }
    }
  }, [id, invoices]);

  // Closing the deep-linked preview must also clear the /invoices/:id URL,
  // otherwise the same invoice can't be reopened from the list.
  function closePreview() {
    setShowPreview(false);
    setSelectedInvoice(null);
    if (id) navigate('/invoices', { replace: true });
  }

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
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span>${idx + 1}. ${escapeHtml(item.description)}</span><span>${formatNumber(item.total)}</span></div>
      <div style="font-size:10px;color:#666;padding-left:16px">${escapeHtml(item.quantity)} x ${formatNumber(item.unitPrice)}${item.discount > 0 ? ` -${formatNumber(item.discount)}` : ''}</div>
    `).join('');
    printHtml(`
      <html><head><title>${escapeHtml(target.invoiceNumber)}</title>
      <link href="/fonts/fonts.css" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Sarabun',sans-serif;width:${width}mm;padding:4mm;font-size:${base}px;color:#000}.divider{border-top:1px dashed #333;margin:6px 0}@media print{@page{size:${width}mm auto;margin:0}body{padding:2mm}}</style>
      </head><body>
        <div style="text-align:center;font-weight:700;font-size:14px">${escapeHtml(company.name || '')}</div>
        <div style="text-align:center;font-size:10px;color:#666">${escapeHtml(company.address || '')}</div>
        <div style="text-align:center;font-size:10px">Tel: ${escapeHtml(company.phone || '')}</div>
        <div class="divider"></div>
        <div style="text-align:center;font-weight:700">${title}${target.status === 'cancelled' ? ' (ยกเลิก)' : ''}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>เลขที่: ${escapeHtml(target.invoiceNumber)}</span><span>${formatDateThai(target.date)}</span></div>
        <div style="font-size:11px">ลูกค้า: ${escapeHtml(target.customerName || '-')}</div>
        <div class="divider"></div>
        ${itemLines}
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between;font-weight:600"><span>รวม:</span><span>${formatNumber(target.subtotal)}</span></div>
        ${target.billDiscount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>ส่วนลดท้ายบิล:</span><span>-${formatNumber(target.billDiscount)}</span></div>` : ''}
        ${target.type === 'tax_invoice' && target.vatIncluded ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>มูลค่าก่อน VAT:</span><span>${formatNumber(target.preVatAmount)}</span></div>` : ''}
        ${target.type === 'tax_invoice' ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>VAT ${target.vatRate}%${target.vatIncluded ? ' (รวมในราคา)' : ''}:</span><span>${formatNumber(target.vatAmount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top:2px solid #000;margin-top:4px;padding-top:4px"><span>รวมทั้งสิ้น:</span><span>${formatNumber(target.grandTotal)} บาท</span></div>
        ${target.whtEnabled ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>หัก ณ ที่จ่าย ${target.whtRate}%:</span><span>-${formatNumber(target.whtAmount)}</span></div><div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top:1px solid #000;margin-top:2px;padding-top:2px"><span>ชำระสุทธิ:</span><span>${formatNumber(target.netPayable)} บาท</span></div>` : ''}
        <div style="font-size:10px;text-align:center;color:#666">(${bahtText(target.whtEnabled ? target.netPayable : target.grandTotal)})</div>
        ${target.paymentMethod === 'cash' && target.cashReceived > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>รับเงิน:</span><span>${formatNumber(target.cashReceived)}</span></div><div style="display:flex;justify-content:space-between;font-size:11px"><span>เงินทอน:</span><span>${formatNumber(target.changeDue)}</span></div>` : ''}
        <div class="divider"></div>
        <div style="text-align:center;font-size:10px;color:#666">ขอบคุณที่ใช้บริการ</div>
      </body></html>
    `);
  }

  const filtered = invoices.filter(inv => {
    const matchSearch = !search ||
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchSource = sourceFilter === 'all' ||
      (sourceFilter === 'quotation' && !!inv.fromQuotation) ||
      (sourceFilter === 'manual' && !inv.fromQuotation);
    return matchSearch && matchStatus && matchSource;
  });

  // ยอดรวม counts only active documents — cancelled ones are excluded.
  const totalAmount = filtered
    .filter(inv => inv.status !== 'cancelled')
    .reduce((s, inv) => s + (inv.grandTotal || 0), 0);

  // Tax documents are VOIDED, not deleted: the record (and its running
  // number) stays for the audit trail, and deducted stock is returned.
  // (Delivery notes never deducted stock, so nothing is returned for them.)
  async function handleCancel(inv) {
    const restockable = inv.type !== 'delivery';

    // A credit/debit note referencing this bill keeps adjusting the reports
    // even after the bill is voided — surface that before cancelling.
    const linkedNotes = (await db.creditNotes.toArray())
      .filter(n => String(n.invoiceId) === String(inv.id));

    const lines = [`ต้องการยกเลิกใบเสร็จ ${inv.invoiceNumber} ใช่หรือไม่?`];
    lines.push(restockable
      ? 'เอกสารจะถูกเก็บไว้ (สถานะ "ยกเลิก") และสต็อคของรายการจะถูกคืนกลับ'
      : 'เอกสารจะถูกเก็บไว้ (สถานะ "ยกเลิก") — ใบส่งของไม่เกี่ยวกับสต็อค');
    if (linkedNotes.length > 0) {
      lines.push(`⚠️ บิลนี้มีใบลดหนี้/เพิ่มหนี้อ้างอิงอยู่ ${linkedNotes.length} ใบ (${linkedNotes.map(n => n.noteNumber).join(', ')}) — โปรดตรวจสอบ/ลบเอกสารเหล่านั้นด้วย ไม่เช่นนั้นรายงานจะยังถูกปรับยอดต่อ`);
    }
    const ok = await appConfirm(lines.join('\n'), { danger: true, okLabel: 'ยกเลิกเอกสาร' });
    if (!ok) return;

    await db.invoices.update(inv.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
    if (restockable) {
      for (const item of (inv.items || []).filter(i => i.productId)) {
        await updateStock(item.productId, parseFloat(item.quantity) || 0, 'return',
          `ยกเลิกใบเสร็จ ${inv.invoiceNumber}`);
      }
    }

    // If this bill came from a quotation, unlock it so it can be converted
    // again (otherwise it stays "แปลงแล้ว" pointing at a voided bill).
    if (inv.fromQuotation) {
      const qt = (await db.quotations.toArray())
        .find(q => q.quotationNumber === inv.fromQuotation && q.status === 'converted');
      if (qt) {
        await db.quotations.update(qt.id, { status: 'accepted' });
        showToast(`ปลดล็อกใบเสนอราคา ${qt.quotationNumber} ให้แปลงใหม่ได้`);
      }
    }

    showToast(restockable ? 'ยกเลิกใบเสร็จแล้ว — คืนสต็อคเรียบร้อย' : 'ยกเลิกเอกสารแล้ว');
    loadInvoices();
  }

  // Hard delete is allowed only AFTER the document has been cancelled.
  async function handleDelete(inv) {
    if (await appConfirm(`ต้องการลบใบเสร็จ ${inv.invoiceNumber} ออกถาวรใช่หรือไม่?\n(เอกสารถูกยกเลิกแล้ว — สต็อคถูกคืนไปแล้วตอนยกเลิก)`, { danger: true, okLabel: 'ลบถาวร' })) {
      await db.invoices.delete(inv.id);
      showToast('ลบใบเสร็จสำเร็จ');
      loadInvoices();
    }
  }

  async function toggleStatus(inv) {
    if (inv.status === 'cancelled') return; // voided documents don't toggle
    const newStatus = inv.status === 'paid' ? 'unpaid' : 'paid';
    await db.invoices.update(inv.id, { status: newStatus });
    showToast(`เปลี่ยนสถานะเป็น "${newStatus === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'}" สำเร็จ`);
    loadInvoices();
  }

  function viewInvoice(inv) {
    setSelectedInvoice(inv);
    setShowPreview(true);
  }

  const previewDotMatrix = isDotMatrixPaper(paperSize);
  const previewTableHeaderStyle = {
    background: previewDotMatrix ? 'white' : '#1e293b',
    color: previewDotMatrix ? '#000' : 'white',
    padding: '6px 8px',
    fontSize: '11px',
    border: previewDotMatrix ? '1px solid #000' : '1px solid #334155',
  };
  const previewCellBorder = previewDotMatrix ? '1px solid #777' : '1px solid #e2e8f0';

  function handlePrint(inv, size = paperSize) {
    const target = inv || selectedInvoice;
    if (!target) return;
    if (size === '80mm' || size === '58mm') return printThermal(target, size === '58mm' ? 58 : 80);

    const cfg = getPaperConfig(size);
    const dotMatrix = isDotMatrixPaper(size);
    // Compact = 9×5.5" continuous form (dot matrix): tight cells, no filler
    // rows, single page (carbon copies come from the multi-part paper).
    const compact = size === '9x5.5';
    const cp = compact ? '3px 6px' : dotMatrix ? '5px 8px' : '8px 10px';
    const items = target.items || [];
    const company = target.company || {};
    const bank = target.bank || {};

    const docTitle = target.type === 'tax_invoice' ? 'ใบกำกับภาษี' : target.type === 'delivery' ? 'ใบส่งของ' : 'ใบเสร็จรับเงิน';
    const docTitleEn = target.type === 'tax_invoice' ? 'Tax Invoice' : target.type === 'delivery' ? 'Delivery Note' : 'Receipt';

    const itemRows = items.map((item, idx) => `
      <tr>
        <td style="padding:${cp};border:1px solid #e2e8f0;text-align:center">${idx + 1}</td>
        <td style="padding:${cp};border:1px solid #e2e8f0">${escapeHtml(item.description)}</td>
        <td style="padding:${cp};border:1px solid #e2e8f0;text-align:center">${escapeHtml(item.quantity)}</td>
        <td style="padding:${cp};border:1px solid #e2e8f0;text-align:right;font-family:Inter,sans-serif">${formatNumber(item.unitPrice)}</td>
        <td style="padding:${cp};border:1px solid #e2e8f0;text-align:right;font-family:Inter,sans-serif">${item.discount > 0 ? formatNumber(item.discount) : '-'}</td>
        <td style="padding:${cp};border:1px solid #e2e8f0;text-align:right;font-weight:600;font-family:Inter,sans-serif">${formatNumber(item.total)}</td>
      </tr>
    `).join('');

    const emptyRows = Array.from({ length: compact ? 0 : Math.max(0, 5 - items.length) }).map(() => `
      <tr>
        <td style="padding:${cp};border:1px solid #e2e8f0">&nbsp;</td>
        <td style="padding:${cp};border:1px solid #e2e8f0"></td>
        <td style="padding:${cp};border:1px solid #e2e8f0"></td>
        <td style="padding:${cp};border:1px solid #e2e8f0"></td>
        <td style="padding:${cp};border:1px solid #e2e8f0"></td>
        <td style="padding:${cp};border:1px solid #e2e8f0"></td>
      </tr>
    `).join('');

    const dotMatrixCss = dotMatrix ? `
              body { color:#000 !important; font-weight:500; }
              div, span, td, th, strong { color:#000 !important; }
              [style*="background:#f8fafc"],
              [style*="background: #f8fafc"] { background:#fff !important; border:1px solid #777 !important; border-radius:0 !important; }
              th { background:#fff !important; color:#000 !important; border:1px solid #000 !important; font-weight:700 !important; }
              td { border-color:#777 !important; }
            ` : '';

    let docHtml = `
      <html>
        <head>
          <title>${docTitle} ${escapeHtml(target.invoiceNumber)}</title>
          <link href="/fonts/fonts.css" rel="stylesheet">
          <style>
            * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:${dotMatrix ? 'economy' : 'exact'}; print-color-adjust:${dotMatrix ? 'economy' : 'exact'}; }
            body { font-family:'Sarabun',sans-serif; padding:${cfg.margin}; color:${dotMatrix ? '#000' : '#1e293b'}; font-size:${cfg.font}; line-height:${compact ? '1.35' : '1.55'}; -webkit-font-smoothing:auto; text-rendering:optimizeLegibility; }
            table { width:100%; border-collapse:collapse; }
            /* Compact mode: collapse the big fixed gaps so a normal bill fits one 9×5.5" page. */
            ${compact ? 'body>div,table{margin-top:6px !important;margin-bottom:6px !important}' : ''}
            ${dotMatrixCss}
            @media print { @page { size:${cfg.page}; margin:0; } body { padding:${cfg.margin}; } }
          </style>
        </head>
        <body>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1e293b">
            <div>
              <div style="font-size:22px;font-weight:800">${docTitle}${target.status === 'cancelled' ? ' <span style="color:#dc2626;font-size:16px">(ยกเลิก)</span>' : ''}</div>
              <div style="font-size:14px;color:#64748b">${docTitleEn}${target.type === 'tax_invoice' ? ' · ต้นฉบับ (Original)' : ''}</div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:12px;justify-content:flex-end">
              ${company.logo ? `<img src="${company.logo}" alt="logo" style="height:52px;max-width:120px;object-fit:contain">` : ''}
              <div style="text-align:right">
                <div style="font-size:18px;font-weight:700">${escapeHtml(company.name || '')}</div>
                ${company.taxId ? `<div style="font-size:11px;color:#64748b">เลขประจำตัวผู้เสียภาษี ${escapeHtml(company.taxId)} (${formatBranch(company.branchCode)})</div>` : ''}
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px">
            <div>
              <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:4px">ลูกค้า:</div>
              <div style="font-weight:600">${escapeHtml(target.customerName || '-')}</div>
              <div style="font-size:12px;color:#475569">ที่อยู่: ${escapeHtml(target.customerAddress || '-')}</div>
              ${target.customerTaxId ? `<div style="font-size:12px;color:#475569">เลขประจำตัวผู้เสียภาษี: ${escapeHtml(target.customerTaxId)} (${formatBranch(target.customerBranchCode)})</div>` : ''}
              ${target.customerPhone ? `<div style="font-size:12px">ผู้ติดต่อ: ${escapeHtml(target.customerPhone)}</div>` : ''}
            </div>
            <div style="text-align:right">
              <div style="margin-bottom:4px">
                <span style="color:#64748b;margin-right:8px">เลขที่:</span>
                <strong style="font-family:Inter,sans-serif">${escapeHtml(target.invoiceNumber)}</strong>
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
              <div>${escapeHtml(company.name || '')}</div>
              <div style="font-size:12px">ที่อยู่: ${escapeHtml(company.address || '')}</div>
              ${company.taxId ? `<div style="font-size:12px">เลขประจำตัวผู้เสียภาษี: ${escapeHtml(company.taxId)} (${formatBranch(company.branchCode)})</div>` : ''}
            </div>
            <div>
              <div style="font-size:12px">จัดเตรียมโดย: <strong>${escapeHtml(target.preparedBy || '-')}</strong></div>
              <div style="font-size:12px">เบอร์ติดต่อ: ${escapeHtml(company.phone || '')}</div>
              <div style="font-size:12px">อีเมล: ${escapeHtml(company.email || '')}</div>
            </div>
          </div>

          <table style="margin:16px 0">
            <thead>
              <tr>
                <th style="background:#1e293b;color:white;padding:${cp};font-size:${compact ? '10px' : '12px'};text-align:center;border:1px solid #334155;width:50px">ลำดับที่</th>
                <th style="background:#1e293b;color:white;padding:${cp};font-size:${compact ? '10px' : '12px'};text-align:center;border:1px solid #334155">รายละเอียด</th>
                <th style="background:#1e293b;color:white;padding:${cp};font-size:${compact ? '10px' : '12px'};text-align:center;border:1px solid #334155;width:70px">จำนวน</th>
                <th style="background:#1e293b;color:white;padding:${cp};font-size:${compact ? '10px' : '12px'};text-align:center;border:1px solid #334155;width:100px">ราคาต่อหน่วย</th>
                <th style="background:#1e293b;color:white;padding:${cp};font-size:${compact ? '10px' : '12px'};text-align:center;border:1px solid #334155;width:80px">ส่วนลด</th>
                <th style="background:#1e293b;color:white;padding:${cp};font-size:${compact ? '10px' : '12px'};text-align:center;border:1px solid #334155;width:110px">รวมเป็นเงิน</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              ${emptyRows}
            </tbody>
          </table>

          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:12px;color:#64748b;max-width:50%">
              ${target.notes ? `<div><strong>หมายเหตุ:</strong> ${escapeHtml(target.notes)}</div>` : ''}
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
              ${target.type === 'tax_invoice' && target.vatIncluded ? `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0">
                <span>มูลค่าสินค้าก่อน VAT</span>
                <span style="font-family:Inter,sans-serif;font-weight:600">${formatNumber(target.preVatAmount)}</span>
              </div>` : ''}
              ${target.type === 'tax_invoice' ? `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0">
                <span>ภาษีมูลค่าเพิ่ม ${target.vatRate}%${target.vatIncluded ? ' (รวมในราคา)' : ''}</span>
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
              <div>- ชื่อบัญชี: ${escapeHtml(bank.accountName)}</div>
              <div>- ธนาคาร ${escapeHtml(bank.bankName)} เลขที่บัญชี ${escapeHtml(bank.accountNumber)}</div>
            ` : ''}
            ${target.paymentMethod === 'cash' ? '<div>- ชำระด้วยเงินสด</div>' : ''}
            ${target.paymentMethod === 'check' ? '<div>- ชำระด้วยเช็ค</div>' : ''}
            ${target.paymentMethod === 'credit' ? '<div>- ชำระด้วยบัตรเครดิต</div>' : ''}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:40px">
            <div style="text-align:center">
              <div style="border-bottom:1px dotted #94a3b8;padding-bottom:${compact ? '18px' : '40px'};margin-bottom:8px"></div>
              <div style="font-size:12px;color:#64748b">อนุมัติโดย</div>
            </div>
            <div style="text-align:center">
              <div style="border-bottom:1px dotted #94a3b8;padding-bottom:${compact ? '18px' : '40px'};margin-bottom:8px"></div>
              <div style="font-size:12px;color:#64748b">รับชำระเงิน</div>
            </div>
          </div>
        </body>
      </html>
    `;
    // Dot-matrix continuous forms normally have carbon/copy plies, so do not
    // emit a second software page for those paper sizes.
    if (target.type === 'tax_invoice' && !dotMatrix) {
      docHtml = docHtml.replace(/<body>([\s\S]*)<\/body>/, (m, inner) =>
        `<body>${inner}<div style="page-break-before:always"></div>${inner.replace('ต้นฉบับ (Original)', 'สำเนา (Copy)')}</body>`);
    }
    printHtml(docHtml);
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
            <option value="cancelled">ยกเลิก</option>
          </select>
          <select
            className="form-select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{ width: '190px' }}
          >
            <option value="all">ทุกที่มา</option>
            <option value="manual">สร้างเอง</option>
            <option value="quotation">จากใบเสนอราคา</option>
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
                      {inv.fromQuotation && (
                        <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                          จาก {inv.fromQuotation}
                        </div>
                      )}
                    </td>
                    <td className="text-right text-bold text-mono">{formatNumber(inv.grandTotal)}</td>
                    <td className="text-center">
                      <button
                        className={`badge ${inv.status === 'paid' ? 'badge-success' : inv.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}`}
                        onClick={() => toggleStatus(inv)}
                        style={{ cursor: inv.status === 'cancelled' ? 'default' : 'pointer', border: 'none' }}
                        title={inv.status === 'cancelled' ? 'เอกสารถูกยกเลิกแล้ว' : 'คลิกเพื่อเปลี่ยนสถานะ'}
                      >
                        {inv.status === 'paid' ? '✅ ชำระแล้ว' : inv.status === 'cancelled' ? '🚫 ยกเลิก' : '⏳ ค้างชำระ'}
                      </button>
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => viewInvoice(inv)} title="ดู">
                          <Eye size={16} />
                        </button>
                        {inv.status !== 'cancelled' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/create-invoice', { state: { editId: inv.id } })} title="แก้ไข">
                            <Edit2 size={16} />
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => handlePrint(inv)} title="พิมพ์">
                          <Printer size={16} />
                        </button>
                        {inv.status !== 'cancelled' ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(inv)} title="ยกเลิกเอกสาร (คืนสต็อค)">
                            <XCircle size={16} />
                          </button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(inv)} title="ลบถาวร">
                            <Trash2 size={16} />
                          </button>
                        )}
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
          onClose={closePreview}
          title={`ใบเสร็จ ${selectedInvoice.invoiceNumber}`}
          size="xl"
          footer={
            <>
              <button className="btn btn-outline" onClick={closePreview}>ปิด</button>
              <select
                className="form-select"
                value={paperSize}
                onChange={e => changePaperSize(e.target.value)}
                style={{ width: 'auto', padding: '8px 28px 8px 12px' }}
              >
                {PAPER_SIZE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button className="btn btn-accent" onClick={() => handlePrint()}>
                <Printer size={18} /> พิมพ์ ({paperSize})
              </button>
            </>
          }
        >
          <div className="invoice-paper" style={{ fontSize: '13px', lineHeight: '1.6', color: previewDotMatrix ? '#000' : undefined }}>
            {/* Simplified preview */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #1e293b' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800 }}>
                  {selectedInvoice.type === 'tax_invoice' ? 'ใบกำกับภาษี' : selectedInvoice.type === 'delivery' ? 'ใบส่งของ' : 'ใบเสร็จรับเงิน'}
                  {selectedInvoice.status === 'cancelled' && <span style={{ color: '#dc2626', fontSize: '15px' }}> (ยกเลิก)</span>}
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
                  <th style={previewTableHeaderStyle}>#</th>
                  <th style={previewTableHeaderStyle}>รายละเอียด</th>
                  <th style={previewTableHeaderStyle}>จำนวน</th>
                  <th style={previewTableHeaderStyle}>ราคา</th>
                  <th style={previewTableHeaderStyle}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {(selectedInvoice.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '6px 8px', border: previewCellBorder, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 8px', border: previewCellBorder }}>{item.description}</td>
                    <td style={{ padding: '6px 8px', border: previewCellBorder, textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ padding: '6px 8px', border: previewCellBorder, textAlign: 'right' }}>{formatNumber(item.unitPrice)}</td>
                    <td style={{ padding: '6px 8px', border: previewCellBorder, textAlign: 'right', fontWeight: 600 }}>{formatNumber(item.total)}</td>
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
