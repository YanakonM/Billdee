import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import Modal from '../components/Common/Modal';
import BarcodeScanner from '../components/Scanner/BarcodeScanner';
import { db, getNextProductCode, updateStock } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDateShort } from '../utils/helpers';
import { Plus, Search, Edit2, Trash2, Package, ScanBarcode, AlertTriangle, PackagePlus, Coins } from 'lucide-react';

// Thai labels + direction for the stock-movement history list.
const LOG_LABELS = {
  sale: { label: 'ขาย', sign: '-' },
  return: { label: 'คืน/ยกเลิกบิล', sign: '+' },
  receive: { label: 'รับเข้า', sign: '+' },
  adjustment_in: { label: 'รับเข้า', sign: '+' },
  adjustment_out: { label: 'ตัดออก', sign: '-' },
  set: { label: 'ตั้งยอด', sign: '+' },
  init: { label: 'เริ่มติดตาม', sign: '=' },
};

export default function Products() {
  const { showToast, appConfirm } = useApp();
  const [products, setProducts] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState({
    code: '', barcode: '', name: '', description: '',
    price: '', unit: 'ชิ้น', category: '', stock: ''
  });

  // Stock receive/adjust modal + movement history
  const [stockProduct, setStockProduct] = useState(null);
  const [stockLogs, setStockLogs] = useState([]);
  const [stockForm, setStockForm] = useState({ mode: 'receive', qty: '', note: '' });
  const [initialStock, setInitialStock] = useState('');
  const [trackStock, setTrackStock] = useState(true);

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    const all = await db.products.toArray();
    setProducts(all);
    const stockSetting = await db.settings.get('stockSettings');
    setLowStockThreshold(stockSetting?.value?.lowStockThreshold ?? 10);
    setTrackStock(stockSetting?.value?.trackStock !== false);
  }

  // Open the stock modal for a product and load its recent movements.
  async function openStock(product) {
    setStockProduct(product);
    setStockForm({ mode: 'receive', qty: '', note: '' });
    setInitialStock('');
    const logs = (await db.stockLogs.toArray())
      .filter(l => String(l.productId) === String(product.id))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 15);
    setStockLogs(logs);
  }

  async function handleStockSubmit() {
    const qty = parseFloat(stockForm.qty);
    if (!qty || qty <= 0) {
      showToast('กรุณากรอกจำนวนมากกว่า 0', 'error');
      return;
    }
    const p = await db.products.get(stockProduct.id);
    if (stockForm.mode === 'set') {
      const delta = qty - (p.stock || 0);
      if (delta === 0) {
        showToast('ยอดเท่าเดิม — ไม่มีการเปลี่ยนแปลง', 'warning');
        return;
      }
      await updateStock(stockProduct.id, Math.abs(delta), delta > 0 ? 'set' : 'adjustment_out',
        stockForm.note || `ตั้งยอดใหม่เป็น ${qty}`);
    } else if (stockForm.mode === 'out') {
      if (qty > (p.stock || 0) && !(await appConfirm(
        `ตัดออก ${qty} แต่คงเหลือ ${p.stock || 0} — สต็อคจะเหลือ 0\nดำเนินการต่อหรือไม่?`,
        { okLabel: 'ตัดออก' }))) return;
      await updateStock(stockProduct.id, qty, 'adjustment_out', stockForm.note || 'ตัดสต็อคออก');
    } else {
      await updateStock(stockProduct.id, qty, 'receive', stockForm.note || 'รับสินค้าเข้า');
    }
    showToast('บันทึกรายการสต็อคแล้ว');
    await loadProducts();
    openStock(await db.products.get(stockProduct.id));
  }

  // For products created with blank stock (= not tracked): opt in with a
  // starting balance. Goes direct to the table because updateStock
  // intentionally ignores null-stock products.
  async function handleStartTracking() {
    const n = parseInt(initialStock);
    if (isNaN(n) || n < 0) {
      showToast('กรุณากรอกยอดเริ่มต้น (0 ขึ้นไป)', 'error');
      return;
    }
    await db.products.update(stockProduct.id, { stock: n });
    await db.stockLogs.add({
      productId: stockProduct.id, date: new Date().toISOString(), type: 'init',
      quantity: n, previousStock: null, newStock: n, note: 'เริ่มติดตามสต็อค',
    });
    showToast('เริ่มติดตามสต็อคแล้ว');
    await loadProducts();
    openStock(await db.products.get(stockProduct.id));
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    return !q ||
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q);
  });

  // `prefill` lets the barcode-scan flow open the modal with the scanned code
  // already filled in (previously openAdd reset the form and lost it).
  // Guard: when used directly as onClick, React passes the click event here —
  // spreading that into the form poisons it with non-cloneable objects that
  // IndexedDB then rejects (DataCloneError).
  async function openAdd(prefill) {
    const extra = prefill && typeof prefill === 'object' && !('nativeEvent' in prefill) ? prefill : {};
    const code = await getNextProductCode();
    setForm({ code, barcode: '', name: '', description: '', price: '', unit: 'ชิ้น', category: '', stock: '', ...extra });
    setEditingProduct(null);
    setShowModal(true);
  }

  function openEdit(product) {
    setForm({
      code: product.code || '',
      barcode: product.barcode || '',
      name: product.name || '',
      description: product.description || '',
      price: product.price?.toString() || '',
      unit: product.unit || 'ชิ้น',
      category: product.category || '',
      // null = not stock-tracked → show as blank, not as "0".
      stock: product.stock == null ? '' : String(product.stock),
    });
    setEditingProduct(product);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast('กรุณากรอกชื่อสินค้า', 'error');
      return;
    }
    if (!form.price || isNaN(form.price)) {
      showToast('กรุณากรอกราคาที่ถูกต้อง', 'error');
      return;
    }
    // Duplicate barcode = the scanner will always pick the other product.
    if (form.barcode.trim()) {
      const dup = products.find(p =>
        p.barcode === form.barcode.trim() && p.id !== editingProduct?.id);
      if (dup && !await appConfirm(
        `บาร์โค้ดนี้ถูกใช้กับ "${dup.name}" อยู่แล้ว — เครื่องสแกนจะเจอสินค้าเดิมเสมอ\nต้องการบันทึกซ้ำหรือไม่?`,
        { okLabel: 'บันทึกต่อ' })) {
        return;
      }
    }
    try {
      const data = {
        ...form,
        barcode: form.barcode.trim(),
        price: parseFloat(form.price),
        // Blank = not tracked (null). "0" typed on purpose = tracked and out of stock.
        stock: String(form.stock).trim() === '' ? null : (parseInt(form.stock) || 0),
      };
      if (editingProduct) {
        await db.products.update(editingProduct.id, { ...data, updatedAt: new Date().toISOString() });
        showToast('แก้ไขสินค้าสำเร็จ');
      } else {
        await db.products.add({ ...data, createdAt: new Date().toISOString() });
        showToast('เพิ่มสินค้าสำเร็จ');
      }
      setShowModal(false);
      loadProducts();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
  }

  async function handleDelete(product) {
    if (await appConfirm(`ต้องการลบสินค้า "${product.name}" ใช่หรือไม่?`, { danger: true, okLabel: 'ลบ' })) {
      await db.products.delete(product.id);
      showToast('ลบสินค้าสำเร็จ');
      loadProducts();
    }
  }

  function handleBarcodeScan(barcode) {
    setShowScanner(false);
    if (showModal) {
      // Modal already open (scan button inside the form) — just fill the field.
      setForm(prev => ({ ...prev, barcode }));
    } else {
      // Scanned from the page header: if the product exists, open it for
      // editing; otherwise open a new-product form pre-filled with the code.
      const existing = products.find(p => p.barcode === barcode);
      if (existing) {
        openEdit(existing);
        showToast(`พบสินค้าเดิม: ${existing.name}`);
      } else {
        openAdd({ barcode });
      }
    }
  }

  // Calculate inventory statistics
  const totalProducts = products.length;
  const totalStockQty = products.reduce((sum, p) => sum + (p.stock != null ? p.stock : 0), 0);
  const totalStockValue = products.reduce((sum, p) => sum + (p.stock != null ? (p.price || 0) * p.stock : 0), 0);

  return (
    <>
      <Header
        title="จัดการสินค้า"
        subtitle={`ทั้งหมด ${products.length} รายการ`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline" onClick={() => setShowScanner(!showScanner)}>
              <ScanBarcode size={18} /> สแกนบาร์โค้ด
            </button>
            <button className="btn btn-primary" onClick={() => openAdd()}>
              <Plus size={18} /> เพิ่มสินค้า
            </button>
          </div>
        }
      />
      <div className="page-content">
        {/* Barcode Scanner */}
        {showScanner && (
          <div style={{ marginBottom: '20px', maxWidth: '500px' }}>
            <BarcodeScanner
              onScan={handleBarcodeScan}
              onClose={() => setShowScanner(false)}
            />
          </div>
        )}

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card stat-card--success">
            <div className="stat-icon stat-icon--success">
              <Coins size={24} />
            </div>
            <div className="stat-info">
              <div className="stat-label">มูลค่าสินค้าในคลังรวม</div>
              <div className="stat-value">฿{formatNumber(totalStockValue)}</div>
              <div className="stat-change text-muted" style={{ fontSize: '12px' }}>
                เฉพาะสินค้าที่เปิดการติดตามสต็อก
              </div>
            </div>
          </div>

          <div className="stat-card stat-card--accent">
            <div className="stat-icon stat-icon--accent">
              <PackagePlus size={24} />
            </div>
            <div className="stat-info">
              <div className="stat-label">จำนวนสินค้าคงเหลือรวม</div>
              <div className="stat-value">{formatNumber(totalStockQty, 0)}</div>
              <div className="stat-change text-muted" style={{ fontSize: '12px' }}>
                ชิ้น/หน่วยสินค้าในคลัง
              </div>
            </div>
          </div>

          <div className="stat-card stat-card--primary">
            <div className="stat-icon stat-icon--primary">
              <Package size={24} />
            </div>
            <div className="stat-info">
              <div className="stat-label">รายการสินค้าทั้งหมด</div>
              <div className="stat-value">{totalProducts}</div>
              <div className="stat-change text-muted" style={{ fontSize: '12px' }}>
                รายการสินค้าในระบบทั้งหมด
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '20px' }}>
          <div className="search-wrapper" style={{ maxWidth: '400px' }}>
            <Search size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="ค้นหาชื่อสินค้า, บาร์โค้ด, หมวดหมู่..."
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
                  <th>บาร์โค้ด</th>
                  <th>ชื่อสินค้า</th>
                  <th>หมวดหมู่</th>
                  <th className="text-right">ราคา</th>
                  <th>หน่วย</th>
                  <th className="text-center">คงเหลือ</th>
                  <th className="text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'var(--font-en)', fontWeight: 600, fontSize: '13px', color: 'var(--color-primary-600)' }}>
                      {p.code}
                    </td>
                    <td style={{ fontFamily: 'var(--font-en)', fontSize: '13px' }}>{p.barcode || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      {p.category ? (
                        <span className="badge badge-primary">{p.category}</span>
                      ) : '-'}
                    </td>
                    <td className="text-right text-mono text-bold">{formatNumber(p.price)}</td>
                    <td>{p.unit}</td>
                    <td className="text-center">
                      {p.stock != null ? (
                        <span className={`badge ${p.stock <= 0 ? 'badge-danger' : p.stock <= lowStockThreshold ? 'badge-warning' : 'badge-success'}`}>
                          {p.stock <= 0 ? `หมด` : p.stock <= lowStockThreshold ? `เหลือ ${p.stock}` : p.stock}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openStock(p)} title="รับเข้า/ปรับสต็อค + ประวัติ">
                          <PackagePlus size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="แก้ไข">
                          <Edit2 size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(p)} title="ลบ">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8">
                      <div className="empty-state">
                        <Package size={48} />
                        <p className="empty-state-title">ไม่พบสินค้า</p>
                        <p className="empty-state-text">
                          {search ? 'ลองค้นหาด้วยคำอื่น' : 'เพิ่มสินค้าชิ้นแรกของคุณ'}
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
        title={editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingProduct ? 'บันทึก' : 'เพิ่มสินค้า'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">รหัสสินค้า</label>
            <input type="text" className="form-input" value={form.code} readOnly
              style={{ background: 'var(--color-gray-50)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">บาร์โค้ด</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" className="form-input" value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="EAN-13, UPC, etc." />
              <button className="btn btn-outline btn-icon" onClick={() => setShowScanner(true)} type="button">
                <ScanBarcode size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">ชื่อสินค้า <span className="required">*</span></label>
          <input type="text" className="form-input" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ชื่อสินค้า / บริการ" />
        </div>
        <div className="form-group">
          <label className="form-label">รายละเอียด</label>
          <textarea className="form-textarea" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="รายละเอียดเพิ่มเติม" rows={2} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">ราคาต่อหน่วย <span className="required">*</span></label>
            <input type="number" className="form-input" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="0.00" min="0" step="0.01" />
          </div>
          <div className="form-group">
            <label className="form-label">หน่วย</label>
            <select className="form-select" value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="ชิ้น">ชิ้น</option>
              <option value="กล่อง">กล่อง</option>
              <option value="ถุง">ถุง</option>
              <option value="แพ็ค">แพ็ค</option>
              <option value="ตัน">ตัน</option>
              <option value="กก.">กก.</option>
              <option value="ม้วน">ม้วน</option>
              <option value="งาน">งาน</option>
              <option value="บริการ">บริการ</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">หมวดหมู่</label>
            <input type="text" className="form-input" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="เช่น วัสดุก่อสร้าง" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">จำนวนคงเหลือ (สต็อค)</label>
          <input type="number" className="form-input" value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            placeholder="0" min="0" style={{ maxWidth: '150px' }} />
          <p className="form-help">เว้นว่างหากไม่ต้องการติดตามสต็อค</p>
        </div>
      </Modal>

      {/* Stock receive/adjust + movement history */}
      <Modal
        isOpen={!!stockProduct}
        onClose={() => setStockProduct(null)}
        title={stockProduct ? `จัดการสต็อค: ${stockProduct.name}` : ''}
        size="lg"
        footer={<button className="btn btn-outline" onClick={() => setStockProduct(null)}>ปิด</button>}
      >
        {stockProduct && (
          <>
            {!trackStock && (
              <div style={{
                padding: '12px 16px', background: 'var(--color-warning-50)',
                borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '13px'
              }}>
                ⚠️ การติดตามสต็อคถูกปิดอยู่ (ตั้งค่า → ใบเสร็จ → การติดตามสต็อก) — รายการที่บันทึกจะไม่มีผลจนกว่าจะเปิดใช้
              </div>
            )}

            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px',
              padding: '12px 16px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>คงเหลือปัจจุบัน</div>
              <div style={{ fontSize: '22px', fontWeight: 800 }}>
                {stockProduct.stock == null ? 'ไม่ติดตาม' : `${stockProduct.stock} ${stockProduct.unit || ''}`}
              </div>
            </div>

            {stockProduct.stock == null ? (
              <div className="form-group">
                <label className="form-label">เริ่มติดตามสต็อค — ยอดเริ่มต้น</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="number" className="form-input" value={initialStock}
                    onChange={e => setInitialStock(e.target.value)}
                    placeholder="0" min="0" style={{ maxWidth: '150px' }} />
                  <button className="btn btn-primary" onClick={handleStartTracking}>เริ่มติดตาม</button>
                </div>
                <p className="form-help">สินค้านี้ยังไม่ติดตามสต็อค — กรอกจำนวนที่มีอยู่จริงเพื่อเริ่มระบบสต็อค</p>
              </div>
            ) : (
              <div className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group">
                  <label className="form-label">การทำรายการ</label>
                  <select className="form-select" value={stockForm.mode}
                    onChange={e => setStockForm({ ...stockForm, mode: e.target.value })}>
                    <option value="receive">📥 รับสินค้าเข้า (+)</option>
                    <option value="out">📤 ตัดสต็อคออก (−)</option>
                    <option value="set">🎯 ตั้งยอดใหม่ (นับสต็อค)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{stockForm.mode === 'set' ? 'ยอดที่นับได้' : 'จำนวน'}</label>
                  <input type="number" className="form-input" value={stockForm.qty}
                    onChange={e => setStockForm({ ...stockForm, qty: e.target.value })}
                    placeholder="0" min="0" />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">หมายเหตุ</label>
                  <input type="text" className="form-input" value={stockForm.note}
                    onChange={e => setStockForm({ ...stockForm, note: e.target.value })}
                    placeholder="เช่น รับจากซัพพลายเออร์, ของเสีย, นับสต็อคประจำเดือน" />
                </div>
                <div className="form-group">
                  <button className="btn btn-primary" onClick={handleStockSubmit}>บันทึก</button>
                </div>
              </div>
            )}

            <h4 style={{ margin: '20px 0 8px', fontWeight: 700, fontSize: '14px' }}>ประวัติการเคลื่อนไหว (ล่าสุด 15 รายการ)</h4>
            {stockLogs.length > 0 ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>รายการ</th>
                      <th className="text-right">จำนวน</th>
                      <th className="text-right">คงเหลือ</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLogs.map((log, i) => {
                      const meta = LOG_LABELS[log.type] || { label: log.type, sign: '' };
                      return (
                        <tr key={log.id ?? i}>
                          <td style={{ fontSize: '12px' }}>{formatDateShort(log.date)}</td>
                          <td><span className={`badge ${meta.sign === '-' ? 'badge-danger' : meta.sign === '+' ? 'badge-success' : 'badge-primary'}`}>{meta.label}</span></td>
                          <td className="text-right text-mono">{meta.sign === '=' ? '' : meta.sign}{formatNumber(log.quantity, 0)}</td>
                          <td className="text-right text-mono text-bold">{log.newStock ?? '-'}</td>
                          <td style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>{log.note || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>ยังไม่มีประวัติการเคลื่อนไหว</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
