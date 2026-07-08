import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Layout/Header';
import BarcodeScanner from '../components/Scanner/BarcodeScanner';
import Modal from '../components/Common/Modal';
import { db, getNextInvoiceNumber, getNextCashBillNumber, getNextCustomerCode, updateStock, reserveDocumentNumber } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateThai, formatDateShort, getToday, bahtText, formatBranch, isValidThaiTaxId, escapeHtml } from '../utils/helpers';
import { generatePromptPayPayload } from '../utils/promptpay';
import { PAPER_SIZE_OPTIONS, PRINT_ITEMS_PER_PAGE, getPaperConfig, isDotMatrixPaper, paginatePrintItems, printHtml } from '../utils/print';
import { QRCodeSVG } from 'qrcode.react';
import {
  FilePlus, ScanBarcode, Plus, Trash2, Search, Save,
  Printer, FileDown, Eye, X, Camera, UserPlus, Share2
} from 'lucide-react';

export default function CreateInvoice() {
  const navigate = useNavigate();
  const location = useLocation();
  const editId = location.state?.editId;
  const { showToast, appConfirm } = useApp();
  const printRef = useRef(null);

  // When set, we are editing an existing invoice instead of creating a new one
  const [editingId, setEditingId] = useState(null);

  // Company & Settings
  const [company, setCompany] = useState({});
  const [bank, setBank] = useState({});
  const [invoiceSettings, setInvoiceSettings] = useState({});
  const [stockSettings, setStockSettings] = useState({ trackStock: true, showStockWarning: true });

  // Invoice Data
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [numberEdited, setNumberEdited] = useState(false); // user typed a custom number
  const [invoiceDate, setInvoiceDate] = useState(getToday());
  const [docType, setDocType] = useState('receipt'); // receipt or tax_invoice

  // Withholding tax (ภาษีหัก ณ ที่จ่าย) — customer withholds, we receive net
  const [whtEnabled, setWhtEnabled] = useState(false);
  const [whtRate, setWhtRate] = useState(3);

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Items
  const [items, setItems] = useState([
    { id: 1, description: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 }
  ]);

  // Scanner
  const [showScanner, setShowScanner] = useState(false);

  // Product quick-search (type a saved product name → add a row with its price)
  const [productSearch, setProductSearch] = useState('');
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // Paper size for printing (remembered across sessions)
  const [paperSize, setPaperSize] = useState('A4');

  // Prepared by
  const [preparedBy, setPreparedBy] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paymentNote, setPaymentNote] = useState('');
  const [cashReceived, setCashReceived] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // Bill-level discount (applied to the whole bill, before VAT)
  const [billDiscount, setBillDiscount] = useState('');

  // Save guard — prevents double-submit creating duplicate invoices
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  // Any form change after a save re-enables the save button — the next save
  // updates the same document (editingId was set after the first save).
  useEffect(() => {
    if (saved) setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, customerSearch, customerPhone, selectedCustomer, invoiceDate, docType,
      paymentMethod, paymentStatus, paymentNote, cashReceived, notes, billDiscount,
      whtEnabled, whtRate, preparedBy]);

  async function loadSettings() {
    const companySetting = await db.settings.get('company');
    const bankSetting = await db.settings.get('bank');
    const invSetting = await db.settings.get('invoice');
    const lastPrepared = await db.settings.get('lastPreparedBy');

    if (companySetting) setCompany(companySetting.value);
    if (bankSetting) setBank(bankSetting.value);
    if (invSetting) setInvoiceSettings(invSetting.value);
    if (lastPrepared) setPreparedBy(lastPrepared.value);

    const stockSetting = await db.settings.get('stockSettings');
    if (stockSetting) setStockSettings(stockSetting.value);

    const printSetting = await db.settings.get('printSettings');
    if (printSetting?.value?.paperSize) setPaperSize(printSetting.value.paperSize);

    const nextNum = await getNextInvoiceNumber();
    setInvoiceNumber(nextNum);

    // Editing an existing invoice — load its data over the blank form.
    if (editId) {
      const inv = await db.invoices.get(editId);
      if (inv) {
        setEditingId(inv.id);
        setInvoiceNumber(inv.invoiceNumber);
        setNumberEdited(true); // keep its number, don't reserve a new one
        setInvoiceDate(inv.date || getToday());
        setDocType(inv.type || 'receipt');
        setSelectedCustomer({
          id: inv.customerId, name: inv.customerName, address: inv.customerAddress,
          phone: inv.customerPhone, taxId: inv.customerTaxId,
          branchCode: inv.customerBranchCode, shopName: inv.customerShopName,
        });
        setCustomerSearch(inv.customerName || '');
        setCustomerPhone(inv.customerPhone || '');
        setItems((inv.items || []).map((it, idx) => ({
          id: it.id ?? (Date.now() + idx),
          description: it.description || '', quantity: it.quantity || 1,
          unitPrice: it.unitPrice || 0, discount: it.discount || 0,
          total: it.total || 0, productId: it.productId,
        })));
        setPaymentMethod(inv.paymentMethod || 'cash');
        setCashReceived(inv.cashReceived ? String(inv.cashReceived) : '');
        setPaymentStatus(inv.status || 'paid');
        setPaymentNote(inv.paymentNote || '');
        setNotes(inv.notes || '');
        setBillDiscount(inv.billDiscount ? String(inv.billDiscount) : '');
        setPreparedBy(inv.preparedBy || '');
        setWhtEnabled(!!inv.whtEnabled);
        setWhtRate(inv.whtRate || 3);
      }
    }
  }

  // Preview the next running number for the selected document type.
  async function refreshPreviewNumber(type) {
    const setting = await db.settings.get('invoice');
    if (!setting) return;
    const v = setting.value;
    if (type === 'delivery') {
      setInvoiceNumber(`${v.deliveryNotePrefix || 'DO'}-${String(v.nextDeliveryNoteNumber || 1).padStart(6, '0')}`);
    } else if (type === 'cash_bill') {
      setInvoiceNumber(`${v.cashBillPrefix || 'CSB'}-${String(v.nextCashBillNumber || 1).padStart(6, '0')}`);
    } else {
      setInvoiceNumber(`${v.prefix || 'INV'}-${String(v.nextNumber || 1).padStart(6, '0')}`);
    }
  }

  // Customer auto-complete
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
    setCustomerPhone(customer.phone || '');
    setShowCustomerDropdown(false);
  }

  // Item management
  function addItem() {
    setItems([...items, {
      id: Date.now(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      total: 0
    }]);
  }

  function updateItem(id, field, value) {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
          const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(updated.quantity) || 0;
          const price = field === 'unitPrice' ? parseFloat(value) || 0 : parseFloat(updated.unitPrice) || 0;
          const disc = field === 'discount' ? parseFloat(value) || 0 : parseFloat(updated.discount) || 0;
          updated.total = (qty * price) - disc;
        }
        return updated;
      }
      return item;
    }));
  }

  function removeItem(id) {
    if (items.length <= 1) return;
    setItems(items.filter(item => item.id !== id));
  }

  // Product name auto-complete
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

  // Add a saved product as a line item. Scanning/picking the same product
  // again increments its quantity (POS behaviour) instead of adding a
  // duplicate row. Also warns when the product is already out of stock.
  function addProductAsItem(product) {
    setItems(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => {
          if (i.productId !== product.id) return i;
          const qty = (parseFloat(i.quantity) || 0) + 1;
          const price = parseFloat(i.unitPrice) || 0;
          const disc = parseFloat(i.discount) || 0;
          return { ...i, quantity: qty, total: (qty * price) - disc };
        });
      }
      const newItem = {
        id: Date.now(),
        description: product.name + (product.description ? ` - ${product.description}` : ''),
        quantity: 1,
        unitPrice: product.price || 0,
        discount: 0,
        total: product.price || 0,
        productId: product.id,
        unit: product.unit || '',
      };
      return [...prev.filter(i => i.description), newItem];
    });
    if (stockSettings.trackStock !== false && stockSettings.showStockWarning !== false &&
        product.stock != null && product.stock <= 0) {
      showToast(`"${product.name}" สต็อคหมด — เพิ่มรายการแล้ว โปรดตรวจสอบ`, 'warning');
    }
  }

  function selectProduct(product) {
    addProductAsItem(product);
    setProductSearch('');
    setShowProductDropdown(false);
  }

  // Barcode scan
  async function handleBarcodeScan(barcode) {
    const product = await db.products.where('barcode').equals(barcode).first();
    if (product) {
      addProductAsItem(product);
      setShowScanner(false);
      showToast(`เพิ่ม "${product.name}" สำเร็จ`);
    } else {
      showToast(`ไม่พบสินค้าบาร์โค้ด: ${barcode}`, 'warning');
    }
  }

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
  const billDiscountNum = Math.min(parseFloat(billDiscount) || 0, subtotal);
  // Taxable base after the bill-level discount
  const netSubtotal = Math.max(0, subtotal - billDiscountNum);
  const vatRate = docType === 'tax_invoice' ? (invoiceSettings.vatRate || 7) : 0;
  // Two VAT modes (Settings → ใบเสร็จ):
  //   exclusive (default) — prices are ex-VAT, VAT is added on top
  //   inclusive           — prices already include VAT, VAT is extracted
  const vatIncluded = docType === 'tax_invoice' && invoiceSettings.includeVat === true;
  const vatAmount = vatIncluded
    ? netSubtotal * vatRate / (100 + vatRate)
    : netSubtotal * vatRate / 100;
  const preVatAmount = vatIncluded ? netSubtotal - vatAmount : netSubtotal;
  const grandTotal = vatIncluded ? netSubtotal : netSubtotal + vatAmount;
  // WHT is computed on the pre-VAT amount (Thai practice) and deducted from the
  // amount the customer actually pays.
  const whtAmount = whtEnabled ? (preVatAmount * whtRate / 100) : 0;
  const netPayable = grandTotal - whtAmount;
  // Amount the customer actually pays (net of WHT), and cash change due.
  const payable = whtEnabled ? netPayable : grandTotal;
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const changeDue = cashReceivedNum > 0 ? cashReceivedNum - payable : 0;

  // Save invoice
  async function handleSave(andPrint = false) {
    // Block re-entry: already saving, or this document was already saved.
    if (saving || saved) {
      if (saved && andPrint) setShowPreview(true);
      return;
    }
    if (items.filter(i => i.description).length === 0) {
      showToast('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', 'error');
      return;
    }

    // A line discount larger than the line amount would make the row (and
    // potentially the whole document) negative — block with a clear pointer.
    const badLine = items.find(i => i.description &&
      (parseFloat(i.discount) || 0) > (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0));
    if (badLine) {
      showToast(`ส่วนลดของ "${badLine.description}" มากกว่ายอดของรายการ — กรุณาแก้ไข`, 'error');
      return;
    }

    if (!invoiceNumber.trim()) {
      showToast('กรุณากรอกเลขที่เอกสาร', 'error');
      return;
    }

    // Full tax invoices must be complete & valid (Revenue Dept. ม.86/4).
    if (docType === 'tax_invoice') {
      if (!isValidThaiTaxId(company.taxId)) {
        showToast('ออกใบกำกับภาษีไม่ได้: กรุณากรอกเลขผู้เสียภาษีของบริษัทให้ถูกต้อง (ตั้งค่า → ข้อมูลบริษัท)', 'error');
        return;
      }
      const buyerTaxId = selectedCustomer?.taxId || '';
      if (!isValidThaiTaxId(buyerTaxId)) {
        showToast('ออกใบกำกับภาษีไม่ได้: เลขผู้เสียภาษีของลูกค้าไม่ถูกต้อง/ไม่ครบ 13 หลัก', 'error');
        return;
      }
      if (!(selectedCustomer?.address || '').trim()) {
        showToast('ออกใบกำกับภาษีไม่ได้: ต้องมีที่อยู่ของลูกค้า', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      // Save prepared by name for next time
      await db.settings.put({ key: 'lastPreparedBy', value: preparedBy });

      // Delivery notes do NOT touch stock: stock is deducted only by the sales
      // document (receipt/tax invoice). Issuing ใบส่งของ + ใบเสร็จ for the same
      // goods previously deducted twice.
      const deductions = docType === 'delivery' ? [] : items.filter(i => i.productId);

      // Warn (don't block) when selling more than the tracked stock on hand.
      if (stockSettings.trackStock !== false && stockSettings.showStockWarning !== false && !editingId) {
        const shortages = [];
        for (const item of deductions) {
          const product = await db.products.get(item.productId);
          if (product && product.stock != null && (parseFloat(item.quantity) || 0) > product.stock) {
            shortages.push(`• ${product.name} — สั่ง ${item.quantity} แต่คงเหลือ ${product.stock}`);
          }
        }
        if (shortages.length > 0) {
          const ok = await appConfirm(
            `สต็อคไม่พอสำหรับรายการต่อไปนี้:\n${shortages.join('\n')}\nต้องการบันทึกต่อหรือไม่? (สต็อคจะถูกตัดจนเหลือ 0)`,
            { okLabel: 'บันทึกต่อ' });
          if (!ok) { setSaving(false); return; }
        }
      }

      // Duplicate-number guard — duplicate เลขที่ใบกำกับภาษี is a compliance
      // violation, so both manual numbers and auto-reserved ones are checked.
      const existingInvoices = await db.invoices.toArray();
      let finalNumber = invoiceNumber.trim();
      let savedId = editingId;

      if (!editingId && !numberEdited) {
        // Reserve atomically; skip numbers already burned by a manually-typed
        // document so the auto series can never collide with one.
        const kind = docType === 'delivery' ? 'delivery' : docType === 'cash_bill' ? 'cash_bill' : 'invoice';
        finalNumber = await reserveDocumentNumber(kind);
        let guard = 0;
        while (existingInvoices.some(i => i.invoiceNumber === finalNumber) && guard++ < 500) {
          finalNumber = await reserveDocumentNumber(kind);
        }
      } else {
        const dup = existingInvoices.some(i =>
          i.invoiceNumber === finalNumber && i.id !== editingId);
        if (dup) {
          showToast(`เลขที่ "${finalNumber}" ถูกใช้ไปแล้ว — กรุณาใช้เลขอื่น`, 'error');
          setSaving(false);
          return;
        }
      }

      // Write the invoice + adjust stock together.
      await db.transaction('rw', db.invoices, db.settings, db.products, db.stockLogs, async () => {
        const invoiceData = {
          invoiceNumber: finalNumber,
          date: invoiceDate,
          type: docType,
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.name || customerSearch,
          customerAddress: selectedCustomer?.address || '',
          customerPhone: customerPhone || selectedCustomer?.phone || '',
          customerTaxId: selectedCustomer?.taxId || '',
          customerBranchCode: selectedCustomer?.branchCode || '',
          customerShopName: selectedCustomer?.shopName || '',
          items: items.filter(i => i.description),
          subtotal,
          billDiscount: billDiscountNum,
          vatRate,
          vatIncluded,
          preVatAmount,
          vatAmount,
          grandTotal,
          whtEnabled,
          whtRate: whtEnabled ? whtRate : 0,
          whtAmount,
          netPayable,
          preparedBy,
          paymentMethod,
          cashReceived: paymentMethod === 'cash' ? cashReceivedNum : 0,
          changeDue: paymentMethod === 'cash' ? changeDue : 0,
          status: paymentStatus,
          paymentNote,
          notes,
          company: { ...company },
          bank: { ...bank },
          createdAt: new Date().toISOString(),
        };

        if (editingId) {
          // Editing: keep the number, update fields, leave stock untouched
          // (stock was already deducted when the invoice was first created).
          const { createdAt, ...fields } = invoiceData;
          await db.invoices.update(editingId, { ...fields, updatedAt: new Date().toISOString() });
        } else {
          savedId = await db.invoices.add(invoiceData);
          // Deduct stock for items with productId
          for (const item of deductions) {
            await updateStock(item.productId, parseFloat(item.quantity) || 0, 'sale', `ใบเสร็จ ${finalNumber}`);
          }
        }
      });

      // Further edits on this screen now UPDATE the saved document instead of
      // being locked out behind a disabled "บันทึกแล้ว" button.
      if (!editingId && savedId != null) setEditingId(savedId);

      setInvoiceNumber(finalNumber);

      // Record customer + purchase time for NEW invoices only (editing an old
      // invoice shouldn't re-stamp the customer's last-purchase time).
      const purchaseTime = new Date().toISOString();
      const phone = customerPhone.trim();
      if (editingId) {
        // Editing an existing invoice — leave customer records as-is.
      } else if (selectedCustomer) {
        // Returning customer — refresh last-purchase time, backfill phone if empty.
        await db.customers.update(selectedCustomer.id, {
          lastPurchaseAt: purchaseTime,
          ...(!selectedCustomer.phone && phone ? { phone } : {}),
        });
      } else if (customerSearch.trim()) {
        const name = customerSearch.trim();
        const exists = await db.customers.where('name').equals(name).first();
        if (exists) {
          await db.customers.update(exists.id, {
            lastPurchaseAt: purchaseTime,
            ...(!exists.phone && phone ? { phone } : {}),
          });
        } else if (await appConfirm(`ต้องการบันทึก "${name}" เป็นลูกค้าใหม่หรือไม่?`, { okLabel: 'บันทึกลูกค้า' })) {
          await db.customers.add({
            code: await getNextCustomerCode(),
            name,
            phone,
            createdAt: purchaseTime,
            lastPurchaseAt: purchaseTime,
          });
        }
      }

      setSaved(true);
      showToast(editingId ? 'แก้ไขใบเสร็จสำเร็จ' : 'บันทึกใบเสร็จสำเร็จ');

      if (andPrint) {
        setShowPreview(true);
      } else {
        navigate('/invoices');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Share via LINE or download
  function handleShare() {
    const text = `ใบเสร็จ ${invoiceNumber}\nลูกค้า: ${selectedCustomer?.name || customerSearch}\nยอดรวม: ${formatNumber(grandTotal)} บาท\nวันที่: ${formatDateThai(invoiceDate)}`;
    if (navigator.share) {
      navigator.share({ title: `ใบเสร็จ ${invoiceNumber}`, text }).catch(() => {});
    } else if (window.__TAURI_INTERNALS__ || !window.open) {
      // Desktop app: window.open is unavailable — copy the text instead.
      navigator.clipboard?.writeText(text)
        .then(() => showToast('คัดลอกข้อความแล้ว — วางส่งใน LINE ได้เลย'))
        .catch(() => showToast('คัดลอกไม่สำเร็จ', 'error'));
    } else {
      // Fallback: open LINE share
      const encoded = encodeURIComponent(text);
      window.open(`https://line.me/R/share?text=${encoded}`, '_blank');
    }
  }

  // Thermal print (58mm/80mm receipt)
  function handleThermalPrint(widthMm = 80) {
    const w = widthMm === 58 ? 58 : 80;
    const base = w === 58 ? 10 : 12; // 58mm rolls are tight → smaller base font
    const filteredItems = items.filter(i => i.description);
    const itemLines = filteredItems.map((item, idx) => `
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0">
        <span>${idx + 1}. ${escapeHtml(item.description)}</span>
        <span>${formatNumber(item.total)}</span>
      </div>
      <div style="font-size:10px;color:#666;padding-left:16px">
        ${escapeHtml(item.quantity)}${item.unit ? ' ' + escapeHtml(item.unit) : ''} x ${formatNumber(item.unitPrice)}${item.discount > 0 ? ` -${formatNumber(item.discount)}` : ''}
      </div>
    `).join('');

    printHtml(`
      <html><head><title>&nbsp;</title>
      <link href="/fonts/fonts.css" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:'Sarabun',sans-serif;width:${w}mm;padding:4mm;font-size:${base}px;color:#000}
        .divider{border-top:1px dashed #333;margin:6px 0}
        @media print{@page{size:${w}mm auto;margin:0}body{padding:2mm}}
      </style></head><body>
        <div style="text-align:center;font-weight:700;font-size:14px">${escapeHtml(company.name || '')}</div>
        <div style="text-align:center;font-size:10px;color:#666">${escapeHtml(company.address || '')}</div>
        <div style="text-align:center;font-size:10px">Tel: ${escapeHtml(company.phone || '')}</div>
        <div class="divider"></div>
        <div style="text-align:center;font-weight:700">${docType === 'tax_invoice' ? 'ใบกำกับภาษี' : docType === 'delivery' ? 'ใบส่งของ' : docType === 'cash_bill' ? 'บิลเงินสด' : 'ใบเสร็จรับเงิน'}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px">
          <span>เลขที่: ${escapeHtml(invoiceNumber)}</span>
          <span>${formatDateThai(invoiceDate)}</span>
        </div>
        <div style="font-size:11px">ลูกค้า: ${escapeHtml(selectedCustomer?.name || customerSearch || '-')}</div>
        <div class="divider"></div>
        ${itemLines}
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between;font-weight:600">
          <span>รวม:</span><span>${formatNumber(subtotal)}</span>
        </div>
        ${billDiscountNum > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>ส่วนลดท้ายบิล:</span><span>-${formatNumber(billDiscountNum)}</span></div>` : ''}
        ${docType === 'tax_invoice' && vatIncluded ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>มูลค่าก่อน VAT:</span><span>${formatNumber(preVatAmount)}</span></div>` : ''}
        ${docType === 'tax_invoice' ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span>VAT ${vatRate}%${vatIncluded ? ' (รวมในราคา)' : ''}:</span><span>${formatNumber(vatAmount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top:2px solid #000;margin-top:4px;padding-top:4px">
          <span>รวมทั้งสิ้น:</span><span>${formatNumber(grandTotal)} บาท</span>
        </div>
        ${whtEnabled ? `
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>หัก ณ ที่จ่าย ${whtRate}%:</span><span>-${formatNumber(whtAmount)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top:1px solid #000;margin-top:2px;padding-top:2px">
          <span>ชำระสุทธิ:</span><span>${formatNumber(netPayable)} บาท</span>
        </div>` : ''}
        <div style="font-size:10px;text-align:center;color:#666">(${bahtText(whtEnabled ? netPayable : grandTotal)})</div>
        ${paymentMethod === 'cash' && cashReceivedNum > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>รับเงิน:</span><span>${formatNumber(cashReceivedNum)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>เงินทอน:</span><span>${formatNumber(changeDue)}</span></div>` : ''}
        <div class="divider"></div>
        <div style="text-align:center;font-size:10px;color:#666">ขอบคุณที่ใช้บริการ</div>
      </body></html>
    `);
  }

  // Full-document print (A4 / A5 / Letter / continuous forms) uses the rendered
  // preview layout, then adds print-only CSS for the selected paper.
  function handleFullPrint(size = 'A4') {
    const content = printRef.current;
    if (!content) return;
    const dotMatrix = isDotMatrixPaper(size);
    const compact = size === '9x5.5';
    const cfg = getPaperConfig(size);
    // Multi-part dot-matrix paper already provides the copy layer.
    const inner = content.innerHTML;
    const bodyHtml = docType === 'tax_invoice' && !dotMatrix
      ? `${inner}<div style="page-break-before:always"></div>${inner.replace('ต้นฉบับ (Original)', 'สำเนา (Copy)')}`
      : inner;
    const dotMatrixCss = dotMatrix ? `
              body, .invoice-paper { color:#000 !important; font-weight:500; }
              div, span, td, th, strong { color:#000 !important; }
              [style*="background: #f8fafc"],
              [style*="background:#f8fafc"] { background:#fff !important; border:1px solid #777 !important; border-radius:0 !important; }
              th { background:#fff !important; color:#000 !important; border:1px solid #000 !important; font-weight:700 !important; }
              td { border-color:#777 !important; }
            ` : '';
    printHtml(`
      <html>
        <head>
          <title>&nbsp;</title>
          <link href="/fonts/fonts.css" rel="stylesheet">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: ${dotMatrix ? 'economy' : 'exact'}; print-color-adjust: ${dotMatrix ? 'economy' : 'exact'}; }
            body { font-family: 'Sarabun', sans-serif; padding: ${cfg.margin}; color: ${dotMatrix ? '#000' : '#1e293b'}; font-size: ${cfg.font}; line-height: ${compact ? '1.24' : dotMatrix ? '1.32' : '1.45'}; -webkit-font-smoothing: auto; text-rendering: optimizeLegibility; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: ${compact ? '2px 5px' : dotMatrix ? '3px 6px' : '5px 8px'}; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .bold { font-weight: 700; }
            .invoice-paper {
              box-shadow:none !important;
              border:none !important;
              border-radius:0 !important;
              max-width:none !important;
              padding:0 !important;
              page-break-after:always;
              break-after:page;
              page-break-inside:avoid;
              break-inside:avoid;
            }
            .invoice-paper:last-child { page-break-after:auto; break-after:auto; }
            tr { page-break-inside: avoid; break-inside: avoid; }
            ${dotMatrix ? `
            .invoice-paper [data-print-section="header"] { margin-bottom:6px !important; padding-bottom:5px !important; }
            .invoice-paper [data-print-section="customer"],
            .invoice-paper [data-print-section="seller"] { margin-bottom:5px !important; gap:12px !important; }
            .invoice-paper [data-print-section="seller"] { padding:5px 7px !important; }
            .invoice-paper [data-print-section="items"] { margin:5px 0 !important; }
            .invoice-paper [data-print-section="payment"] { margin-top:5px !important; padding-top:4px !important; }
            .invoice-paper [data-print-section="signatures"] { margin-top:8px !important; gap:20px !important; }
            .invoice-paper [data-print-line="signature"] { padding-bottom:12px !important; }
            ` : ''}
            ${dotMatrixCss}
            @media print { @page { size: ${cfg.page}; margin: 0; } body { padding: ${cfg.margin}; } }
          </style>
        </head>
        <body>${bodyHtml}</body>
      </html>
    `);
  }

  // Route to the right printer based on the chosen paper size.
  function doPrint(size = paperSize) {
    if (size === '80mm') return handleThermalPrint(80);
    if (size === '58mm') return handleThermalPrint(58);
    return handleFullPrint(size);
  }

  // Remember the paper-size choice across sessions.
  async function changePaperSize(size) {
    setPaperSize(size);
    const cur = (await db.settings.get('printSettings'))?.value || {};
    await db.settings.put({ key: 'printSettings', value: { ...cur, paperSize: size } });
  }

  const printCompact = paperSize === '9x5.5';
  const printDotMatrix = isDotMatrixPaper(paperSize);
  const invoicePrintData = {
    invoiceNumber, invoiceDate, docType,
    customer: selectedCustomer || { name: customerSearch },
    items: items.filter(i => i.description),
    subtotal, billDiscount: billDiscountNum,
    vatRate, vatIncluded, preVatAmount, vatAmount, grandTotal,
    whtEnabled, whtRate, whtAmount, netPayable,
    preparedBy, paymentMethod, paymentStatus,
    cashReceived: cashReceivedNum, changeDue,
    notes, company, bank,
  };

  return (
    <>
      <div ref={printRef} style={{ display: 'none' }} aria-hidden="true">
        <InvoicePrintLayout
          compact={printCompact}
          dotMatrix={printDotMatrix}
          data={invoicePrintData}
        />
      </div>
      <Header
        title={editingId ? 'แก้ไขใบเสร็จ' : 'สร้างใบเสร็จ'}
        subtitle={invoiceNumber}
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="form-select"
              value={paperSize}
              onChange={e => changePaperSize(e.target.value)}
              title="ขนาดกระดาษสำหรับพิมพ์"
              style={{ width: 'auto', padding: '6px 28px 6px 10px', fontSize: '13px' }}
            >
              {PAPER_SIZE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => setShowPreview(true)}>
              <Eye size={16} /> ดูตัวอย่าง
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => doPrint()} title="พิมพ์ตามขนาดที่เลือก">
              <Printer size={16} /> พิมพ์
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleShare}>
              <Share2 size={16} /> แชร์
            </button>
            <button className="btn btn-accent" onClick={() => handleSave(true)} disabled={saving}>
              <Printer size={18} /> {saved ? 'พิมพ์' : (saving ? 'กำลังบันทึก...' : 'บันทึก & พิมพ์')}
            </button>
            <button className="btn btn-primary" onClick={() => handleSave(false)} disabled={saving || saved}>
              <Save size={18} /> {saved ? 'บันทึกแล้ว' : (saving ? 'กำลังบันทึก...' : 'บันทึก')}
            </button>
          </div>
        }
      />

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', maxWidth: '1100px', margin: '0 auto' }}>

          {/* Document Type & Date */}
          <div className="card">
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ประเภทเอกสาร</label>
                  <select className="form-select" value={docType} onChange={e => {
                    setDocType(e.target.value);
                    if (!numberEdited && !editingId) refreshPreviewNumber(e.target.value);
                  }}>
                    <option value="receipt">ใบเสร็จรับเงิน (Receipt)</option>
                    <option value="cash_bill">บิลเงินสด (Cash Bill)</option>
                    <option value="tax_invoice">ใบกำกับภาษี (Tax Invoice)</option>
                    <option value="delivery">ใบส่งของ (Delivery Note)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">เลขที่เอกสาร</label>
                  <input type="text" className="form-input" value={invoiceNumber}
                    onChange={e => { setInvoiceNumber(e.target.value); setNumberEdited(true); }}
                    style={{ fontFamily: 'var(--font-en)', fontWeight: 700 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">วันที่</label>
                  <input type="date" className="form-input" value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">👤 ข้อมูลลูกค้า</h3>
            </div>
            <div className="card-body">
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">ชื่อลูกค้า (พิมพ์เพื่อค้นหา)</label>
                <div className="search-wrapper">
                  <Search size={18} />
                  <input
                    type="text"
                    className="search-input"
                    value={customerSearch}
                    onChange={e => handleCustomerSearch(e.target.value)}
                    onFocus={() => customerSearch && handleCustomerSearch(customerSearch)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    placeholder="พิมพ์ชื่อลูกค้า, ชื่อร้าน, หรือเบอร์โทร..."
                  />
                </div>
                {showCustomerDropdown && (
                  <div className="autocomplete-dropdown">
                    {customerSuggestions.map(c => (
                      <div key={c.id} className="autocomplete-item" onMouseDown={() => selectCustomer(c)}>
                        <div className="autocomplete-item-name">{c.name}</div>
                        <div className="autocomplete-item-detail">
                          {c.shopName && `🏪 ${c.shopName} · `}
                          {c.phone && `📞 ${c.phone}`}
                          {c.lastPurchaseAt && ` · ซื้อล่าสุด ${formatDateShort(c.lastPurchaseAt)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">เบอร์โทรลูกค้า</label>
                <input
                  type="tel"
                  className="form-input"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="เบอร์โทร (บันทึกให้อัตโนมัติเมื่อเป็นลูกค้าใหม่)"
                  style={{ maxWidth: '320px' }}
                />
              </div>

              {selectedCustomer && (
                <div style={{
                  padding: '16px',
                  background: 'var(--color-primary-50)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-primary-200)',
                  marginTop: '-8px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div><strong>ชื่อ:</strong> {selectedCustomer.name}</div>
                    <div><strong>ร้าน:</strong> {selectedCustomer.shopName || '-'}</div>
                    <div><strong>เบอร์:</strong> {selectedCustomer.phone || '-'}</div>
                    <div><strong>เลขภาษี:</strong> {selectedCustomer.taxId || '-'}</div>
                    <div style={{ gridColumn: '1/-1' }}><strong>ที่อยู่:</strong> {selectedCustomer.address || '-'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📦 รายการสินค้า / บริการ</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-sm btn-outline" onClick={() => setShowScanner(!showScanner)}>
                  <ScanBarcode size={16} /> สแกน
                </button>
                <button className="btn btn-sm btn-primary" onClick={addItem}>
                  <Plus size={16} /> เพิ่มรายการ
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {showScanner && (
                <div style={{ padding: '16px', borderBottom: '1px solid var(--color-gray-100)' }}>
                  <BarcodeScanner
                    onScan={handleBarcodeScan}
                    onClose={() => setShowScanner(false)}
                  />
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
                      <th style={{ width: '60px' }}>ลำดับ</th>
                      <th>รายละเอียด</th>
                      <th style={{ width: '100px' }}>จำนวน</th>
                      <th style={{ width: '80px' }}>หน่วย</th>
                      <th style={{ width: '130px' }}>ราคา/หน่วย</th>
                      <th style={{ width: '110px' }}>ส่วนลด</th>
                      <th style={{ width: '130px' }} className="text-right">รวม</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="text-center">{idx + 1}</td>
                        <td>
                          <input
                            type="text"
                            className="form-input"
                            value={item.description}
                            onChange={e => updateItem(item.id, 'description', e.target.value)}
                            placeholder="ชื่อสินค้า / บริการ"
                            style={{ border: 'none', padding: '4px 8px', background: 'transparent' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-input"
                            value={item.quantity}
                            onChange={e => updateItem(item.id, 'quantity', e.target.value)}
                            min="1"
                            style={{ textAlign: 'center', padding: '4px 8px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-input"
                            value={item.unit || ''}
                            onChange={e => updateItem(item.id, 'unit', e.target.value)}
                            placeholder="ชิ้น"
                            style={{ textAlign: 'center', padding: '4px 8px', border: 'none', background: 'transparent' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-input"
                            value={item.unitPrice}
                            onChange={e => updateItem(item.id, 'unitPrice', e.target.value)}
                            min="0"
                            step="0.01"
                            style={{ textAlign: 'right', padding: '4px 8px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-input"
                            value={item.discount}
                            onChange={e => updateItem(item.id, 'discount', e.target.value)}
                            min="0"
                            style={{ textAlign: 'right', padding: '4px 8px' }}
                          />
                        </td>
                        <td className="text-right text-bold text-mono">
                          {formatNumber(item.total)}
                        </td>
                        <td>
                          {items.length > 1 && (
                            <button className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div style={{ padding: '20px 24px', borderTop: '2px solid var(--color-gray-200)' }}>
                <div className="invoice-summary">
                  <div className="invoice-summary-table">
                    <div className="invoice-summary-row">
                      <span>ราคารวมสินค้า (บาท)</span>
                      <span className="text-mono">{formatNumber(subtotal)}</span>
                    </div>
                    <div className="invoice-summary-row" style={{ alignItems: 'center' }}>
                      <span>ส่วนลดท้ายบิล</span>
                      <input type="number" className="form-input" value={billDiscount}
                        onChange={e => setBillDiscount(e.target.value)}
                        placeholder="0" min="0" step="0.01"
                        style={{ maxWidth: '120px', textAlign: 'right', padding: '4px 8px' }} />
                    </div>
                    {docType === 'tax_invoice' && vatIncluded && (
                      <div className="invoice-summary-row">
                        <span>มูลค่าสินค้าก่อน VAT</span>
                        <span className="text-mono">{formatNumber(preVatAmount)}</span>
                      </div>
                    )}
                    {docType === 'tax_invoice' && (
                      <div className="invoice-summary-row">
                        <span>ภาษีมูลค่าเพิ่ม {vatRate}%{vatIncluded ? ' (รวมในราคา)' : ''}</span>
                        <span className="text-mono">{formatNumber(vatAmount)}</span>
                      </div>
                    )}
                    <div className="invoice-summary-row total">
                      <span>จำนวนเงินรวมทั้งสิ้น</span>
                      <span className="text-mono">{formatNumber(grandTotal)}</span>
                    </div>
                    {whtEnabled && (
                      <>
                        <div className="invoice-summary-row">
                          <span>หัก ณ ที่จ่าย {whtRate}%</span>
                          <span className="text-mono">-{formatNumber(whtAmount)}</span>
                        </div>
                        <div className="invoice-summary-row total">
                          <span>ยอดชำระสุทธิ</span>
                          <span className="text-mono">{formatNumber(netPayable)}</span>
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: '13px', color: 'var(--color-gray-500)', textAlign: 'right', marginTop: '4px' }}>
                      ({bahtText(whtEnabled ? netPayable : grandTotal)})
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment & Notes */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">💳 การชำระเงิน</h3>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ช่องทางชำระเงิน</label>
                  <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="cash">💵 เงินสด</option>
                    <option value="transfer">🏦 โอนเงิน</option>
                    <option value="check">📄 เช็ค</option>
                    <option value="credit">💳 บัตรเครดิต</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">สถานะ</label>
                  <select className="form-select" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                    <option value="paid">✅ ชำระแล้ว</option>
                    <option value="unpaid">⏳ ค้างชำระ</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ผู้จัดทำ</label>
                  <input type="text" className="form-input" value={preparedBy}
                    onChange={e => setPreparedBy(e.target.value)}
                    placeholder="ชื่อผู้จัดทำเอกสาร" />
                </div>
              </div>
              {paymentMethod === 'transfer' && bank.bankName && (
                <div style={{
                  padding: '12px',
                  background: 'var(--color-primary-50)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px'
                }}>
                  <strong>ข้อมูลบัญชี:</strong> {bank.bankName} · {bank.accountName} · เลขที่ {bank.accountNumber}
                </div>
              )}

              {/* Withholding tax */}
              <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={whtEnabled}
                    onChange={e => setWhtEnabled(e.target.checked)} />
                  หักภาษี ณ ที่จ่าย (ลูกค้าเป็นผู้หัก)
                </label>
                {whtEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <select className="form-select" value={whtRate}
                      onChange={e => setWhtRate(parseFloat(e.target.value))}
                      style={{ maxWidth: '220px' }}>
                      <option value={1}>1% — ค่าขนส่ง</option>
                      <option value={2}>2% — ค่าโฆษณา</option>
                      <option value={3}>3% — ค่าบริการ / รับจ้างทำของ</option>
                      <option value={5}>5% — ค่าเช่า / รางวัล</option>
                      <option value={10}>10% — เงินปันผล</option>
                    </select>
                    <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                      หัก <strong>{formatNumber(whtAmount)}</strong> บาท · ลูกค้าชำระสุทธิ <strong>{formatNumber(netPayable)}</strong> บาท
                    </div>
                  </div>
                )}
                <p className="form-help" style={{ marginTop: '8px' }}>
                  คำนวณจากฐานก่อน VAT หลังหักส่วนลด ({formatNumber(preVatAmount)} บาท) — ลูกค้าจะออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ให้ภายหลัง
                </p>
              </div>
              {paymentMethod === 'cash' && (
                <div style={{ marginTop: '16px', display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">รับเงินมา (บาท)</label>
                    <input type="number" className="form-input" value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      placeholder={formatNumber(payable)} min="0" step="0.01"
                      style={{ maxWidth: '200px' }} />
                  </div>
                  {cashReceivedNum > 0 && (
                    <div style={{ fontSize: '15px', paddingBottom: '10px' }}>
                      เงินทอน: <strong style={{ color: changeDue < 0 ? 'var(--color-danger-600)' : 'var(--color-success-600)' }}>
                        {formatNumber(changeDue)}
                      </strong> บาท
                      {changeDue < 0 && <span style={{ color: 'var(--color-danger-600)' }}> · รับเงินไม่พอ</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">หมายเหตุ</label>
                <textarea className="form-textarea" value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม" rows={2} />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="ตัวอย่างใบเสร็จ"
        size="xl"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowPreview(false)}>ปิด</button>
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
            <button className="btn btn-accent" onClick={() => doPrint()}>
              <Printer size={18} /> พิมพ์ ({paperSize})
            </button>
          </>
        }
      >
        <div>
          <InvoicePrintLayout
            compact={printCompact}
            dotMatrix={printDotMatrix}
            data={invoicePrintData}
          />
        </div>
      </Modal>
    </>
  );
}

// Invoice Print Layout (matches the reference image).
// `compact` = 9×5.5" continuous-form mode (dot matrix): no filler rows, tight
// margins/paddings, small signature strip — a typical bill fits one half-page.
function InvoicePrintLayout({ data, compact = false, dotMatrix = false }) {
  const {
    invoiceNumber, invoiceDate, docType,
    customer, items, subtotal, billDiscount,
    vatRate, vatIncluded, preVatAmount, vatAmount, grandTotal,
    whtEnabled, whtRate, whtAmount, netPayable,
    preparedBy, paymentMethod, cashReceived, changeDue, notes, company, bank,
  } = data;

  const docTitle = docType === 'tax_invoice' ? 'ใบกำกับภาษี' : docType === 'delivery' ? 'ใบส่งของ' : docType === 'cash_bill' ? 'บิลเงินสด' : 'ใบเสร็จรับเงิน';
  const docTitleEn = docType === 'tax_invoice' ? 'Tax Invoice' : docType === 'delivery' ? 'Delivery Note' : docType === 'cash_bill' ? 'Cash Bill' : 'Receipt';
  const payAmount = whtEnabled ? netPayable : grandTotal;
  const printPages = paginatePrintItems(items, PRINT_ITEMS_PER_PAGE);

  // Spacing knobs shared by normal and compact modes.
  const cellPad = compact ? '2px 5px' : dotMatrix ? '3px 6px' : '5px 8px';
  const sectionGap = compact ? '5px' : dotMatrix ? '6px' : '10px';
  const fillerRows = 0;
  const baseFont = compact ? '10px' : dotMatrix ? '10.5px' : '12px';
  const lineHeight = compact ? '1.22' : dotMatrix ? '1.28' : '1.42';
  const titleFont = compact ? '15px' : dotMatrix ? '18px' : '21px';
  const titleEnFont = compact ? '10px' : dotMatrix ? '11px' : '13px';
  const logoHeight = compact ? '32px' : dotMatrix ? '36px' : '46px';
  const headerMargin = compact ? '6px' : dotMatrix ? '6px' : '12px';
  const headerPad = compact ? '5px' : dotMatrix ? '5px' : '10px';
  const sellerPad = compact ? '5px 7px' : dotMatrix ? '5px 7px' : '8px 10px';
  const tableMargin = compact ? '5px 0' : dotMatrix ? '5px 0' : '10px 0';
  const paymentMargin = compact ? '6px' : dotMatrix ? '7px' : '12px';
  const paymentPad = compact ? '4px' : dotMatrix ? '5px' : '8px';
  const signatureGap = compact ? '18px' : dotMatrix ? '24px' : '40px';
  const signatureMargin = compact ? '8px' : dotMatrix ? '12px' : '24px';
  const signaturePad = compact ? '12px' : dotMatrix ? '16px' : '28px';
  const summaryPad = dotMatrix ? '3px 0' : '5px 0';
  const totalPad = dotMatrix ? '5px 0' : '8px 0';
  const ink = dotMatrix ? '#000' : '#1e293b';
  const muted = dotMatrix ? '#000' : '#64748b';
  const subText = dotMatrix ? '#000' : '#475569';
  const borderStrong = dotMatrix ? '#000' : '#1e293b';
  const borderLight = dotMatrix ? '#777' : '#e2e8f0';
  const tableHeaderStyle = {
    background: 'white',
    color: '#000',
    padding: cellPad,
    fontSize: compact ? '10px' : dotMatrix ? '10.5px' : '12px',
    textAlign: 'center',
    border: '1px solid #000',
    fontWeight: 700,
  };
  const sellerPanelStyle = { background: 'white', border: '1px solid #777', borderRadius: 0 };

  return (
    <>
      {printPages.map((pageItems, pageIndex) => {
        const itemOffset = pageIndex * PRINT_ITEMS_PER_PAGE;
        return (
    <div
      className="invoice-paper"
      key={`invoice-page-${pageIndex}`}
      style={{
        fontSize: baseFont,
        lineHeight,
        color: ink,
        pageBreakAfter: pageIndex === printPages.length - 1 ? 'auto' : 'always',
        breakAfter: pageIndex === printPages.length - 1 ? 'auto' : 'page',
      }}
    >
      {/* Header */}
      <div data-print-section="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: headerMargin, paddingBottom: headerPad, borderBottom: `2px solid ${borderStrong}` }}>
        <div>
          <div style={{ fontSize: titleFont, fontWeight: 800 }}>{docTitle}</div>
          <div style={{ fontSize: titleEnFont, color: muted }}>
            {docTitleEn}
            {docType === 'tax_invoice' && <span> · ต้นฉบับ (Original)</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', justifyContent: 'flex-end' }}>
          {company.logo && (
            <img src={company.logo} alt="logo"
              style={{ height: logoHeight, maxWidth: '120px', objectFit: 'contain' }} />
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{company.name || 'บริษัท'}</div>
            {company.nameEn && <div style={{ fontSize: '11px', color: muted }}>{company.nameEn}</div>}
            {company.taxId && (
              <div style={{ fontSize: '11px', color: muted }}>
                เลขประจำตัวผู้เสียภาษี {company.taxId} ({formatBranch(company.branchCode)})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer & Invoice info */}
      <div data-print-section="customer" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: dotMatrix || compact ? '12px' : '20px', marginBottom: sectionGap }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: muted, marginBottom: '4px' }}>ลูกค้า:</div>
          <div style={{ fontWeight: 600 }}>{customer?.name || '-'}</div>
          {customer?.shopName && <div>🏪 {customer.shopName}</div>}
          <div style={{ fontSize: '12px', color: subText }}>ที่อยู่: {customer?.address || '-'}</div>
          {customer?.taxId && (
            <div style={{ fontSize: '12px', color: subText }}>
              เลขประจำตัวผู้เสียภาษี: {customer.taxId} ({formatBranch(customer.branchCode)})
            </div>
          )}
          {customer?.phone && <div style={{ fontSize: '12px' }}>ผู้ติดต่อ: {customer.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: muted, marginRight: '8px' }}>เลขที่:</span>
            <strong style={{ fontFamily: 'Inter, sans-serif' }}>{invoiceNumber}</strong>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: muted, marginRight: '8px' }}>วันที่:</span>
            <strong>{formatDateThai(invoiceDate)}</strong>
          </div>
          {printPages.length > 1 && (
            <div style={{ fontSize: '11px', color: muted }}>
              หน้า {pageIndex + 1}/{printPages.length}
            </div>
          )}
        </div>
      </div>

      {/* Seller info */}
      <div data-print-section="seller" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: dotMatrix || compact ? '12px' : '20px', marginBottom: sectionGap, padding: sellerPad, ...sellerPanelStyle }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: muted, marginBottom: '4px' }}>ผู้ออก:</div>
          <div>{company.name}</div>
          <div style={{ fontSize: '12px' }}>ที่อยู่: {company.address}</div>
          {company.taxId && (
            <div style={{ fontSize: '12px' }}>
              เลขประจำตัวผู้เสียภาษี: {company.taxId} ({formatBranch(company.branchCode)})
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: '12px' }}>จัดเตรียมโดย: <strong>{preparedBy || '-'}</strong></div>
          <div style={{ fontSize: '12px' }}>เบอร์ติดต่อ: {company.phone}</div>
          <div style={{ fontSize: '12px' }}>อีเมล: {company.email}</div>
        </div>
      </div>

      {/* Items Table */}
      <table data-print-section="items" style={{ width: '100%', borderCollapse: 'collapse', margin: tableMargin }}>
        <thead>
          <tr>
            <th style={{ ...tableHeaderStyle, width: '50px' }}>ลำดับที่</th>
            <th style={tableHeaderStyle}>รายละเอียด</th>
            <th style={{ ...tableHeaderStyle, width: '60px' }}>จำนวน</th>
            <th style={{ ...tableHeaderStyle, width: '60px' }}>หน่วย</th>
            <th style={{ ...tableHeaderStyle, width: '100px' }}>ราคาต่อหน่วย</th>
            <th style={{ ...tableHeaderStyle, width: '80px' }}>ส่วนลด</th>
            <th style={{ ...tableHeaderStyle, width: '110px' }}>รวมเป็นเงิน</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((item, idx) => (
            <tr key={idx}>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}`, textAlign: 'center' }}>{itemOffset + idx + 1}</td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}>{item.description}</td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}`, textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}`, textAlign: 'center' }}>{item.unit || '-'}</td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}`, textAlign: 'right', fontFamily: 'Inter, sans-serif' }}>{formatNumber(item.unitPrice)}</td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}`, textAlign: 'right', fontFamily: 'Inter, sans-serif' }}>{item.discount > 0 ? formatNumber(item.discount) : '-'}</td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}`, textAlign: 'right', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{formatNumber(item.total)}</td>
            </tr>
          ))}
          {/* Empty rows to fill space (skipped on compact half-page forms). */}
          {Array.from({ length: fillerRows }).map((_, idx) => (
            <tr key={`empty-${idx}`}>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}>&nbsp;</td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}></td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}></td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}></td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}></td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}></td>
              <td style={{ padding: cellPad, border: `1px solid ${borderLight}` }}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div data-print-section="summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '12px', color: muted, maxWidth: '50%' }}>
          {notes && <div><strong>หมายเหตุ:</strong> {notes}</div>}
        </div>
        <div style={{ width: '280px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: summaryPad, borderBottom: `1px solid ${borderLight}` }}>
            <span>ราคารวมสินค้า (บาท)</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{formatNumber(subtotal)}</span>
          </div>
          {billDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: summaryPad, borderBottom: `1px solid ${borderLight}` }}>
              <span>ส่วนลดท้ายบิล</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>-{formatNumber(billDiscount)}</span>
            </div>
          )}
          {docType === 'tax_invoice' && vatIncluded && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: summaryPad, borderBottom: `1px solid ${borderLight}` }}>
              <span>มูลค่าสินค้าก่อน VAT</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{formatNumber(preVatAmount)}</span>
            </div>
          )}
          {docType === 'tax_invoice' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: summaryPad, borderBottom: `1px solid ${borderLight}` }}>
              <span>ภาษีมูลค่าเพิ่ม {vatRate}%{vatIncluded ? ' (รวมในราคา)' : ''}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{formatNumber(vatAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: totalPad, borderTop: `2px solid ${borderStrong}`, fontWeight: 800, fontSize: dotMatrix || compact ? '14px' : '15px' }}>
            <span>จำนวนเงินรวมทั้งสิ้น</span>
            <span style={{ fontFamily: 'Inter, sans-serif' }}>{formatNumber(grandTotal)}</span>
          </div>
          {whtEnabled && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: summaryPad, borderBottom: `1px solid ${borderLight}` }}>
                <span>หัก ณ ที่จ่าย {whtRate}%</span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>-{formatNumber(whtAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: totalPad, borderTop: `2px solid ${borderStrong}`, fontWeight: 800, fontSize: dotMatrix || compact ? '14px' : '15px' }}>
                <span>ยอดชำระสุทธิ</span>
                <span style={{ fontFamily: 'Inter, sans-serif' }}>{formatNumber(netPayable)}</span>
              </div>
            </>
          )}
          <div style={{ fontSize: '12px', color: muted, textAlign: 'right' }}>
            ({bahtText(payAmount)})
          </div>
        </div>
      </div>

      {/* Payment Info */}
      <div data-print-section="payment" style={{ marginTop: paymentMargin, paddingTop: paymentPad, borderTop: `1px solid ${borderLight}`, fontSize: compact || dotMatrix ? '11px' : '12px' }}>
        <div style={{ fontWeight: 700, marginBottom: '4px' }}>ข้อมูลการชำระเงิน:</div>
        {paymentMethod === 'transfer' && bank.bankName && (
          <>
            <div>- ชื่อบัญชี: {bank.accountName}</div>
            <div>- ธนาคาร {bank.bankName} เลขที่บัญชี {bank.accountNumber}</div>
          </>
        )}
        {paymentMethod === 'cash' && <div>- ชำระด้วยเงินสด</div>}
        {paymentMethod === 'cash' && cashReceived > 0 && (
          <>
            <div>- รับเงินมา: {formatNumber(cashReceived)} บาท</div>
            <div>- เงินทอน: {formatNumber(changeDue)} บาท</div>
          </>
        )}
        {paymentMethod === 'check' && <div>- ชำระด้วยเช็ค</div>}
        {paymentMethod === 'credit' && <div>- ชำระด้วยบัตรเครดิต</div>}
      </div>

      {/* PromptPay QR Code */}
      {paymentMethod === 'transfer' && bank.promptPayId && (
        <div style={{ marginTop: compact ? '8px' : dotMatrix ? '7px' : '16px', textAlign: 'center', padding: compact || dotMatrix ? '8px' : '16px', border: `1px dashed ${borderLight}`, borderRadius: dotMatrix ? 0 : '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>สแกนจ่ายผ่าน PromptPay</div>
          <QRCodeSVG
            value={(() => { try { return generatePromptPayPayload(bank.promptPayId, payAmount); } catch { return ''; } })()}
            size={compact ? 84 : 120}
            level="M"
          />
          <div style={{ fontSize: '11px', color: muted, marginTop: '6px' }}>PromptPay: {bank.promptPayId}</div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{formatNumber(payAmount)} บาท</div>
        </div>
      )}

      {/* Signatures */}
      <div data-print-section="signatures" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: signatureGap, marginTop: signatureMargin }}>
        <div style={{ textAlign: 'center' }}>
          <div data-print-line="signature" style={{ borderBottom: `1px dotted ${dotMatrix ? '#000' : '#94a3b8'}`, paddingBottom: signaturePad, marginBottom: dotMatrix || compact ? '4px' : '8px' }}></div>
          <div style={{ fontSize: '12px', color: muted }}>อนุมัติโดย</div>
          <div style={{ fontSize: '11px', color: muted, marginTop: '4px' }}>วันที่ ........./........./.........</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div data-print-line="signature" style={{ borderBottom: `1px dotted ${dotMatrix ? '#000' : '#94a3b8'}`, paddingBottom: signaturePad, marginBottom: dotMatrix || compact ? '4px' : '8px' }}></div>
          <div style={{ fontSize: '12px', color: muted }}>รับชำระเงิน</div>
          <div style={{ fontSize: '11px', color: muted, marginTop: '4px' }}>วันที่ ........./........./.........</div>
        </div>
      </div>
    </div>
        );
      })}
    </>
  );
}
