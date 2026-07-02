import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import Modal from '../components/Common/Modal';
import BarcodeScanner from '../components/Scanner/BarcodeScanner';
import { db, getNextProductCode } from '../db/database';
import { useApp } from '../context/AppContext';
import { formatNumber } from '../utils/helpers';
import { Plus, Search, Edit2, Trash2, Package, ScanBarcode, AlertTriangle } from 'lucide-react';

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

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    const all = await db.products.toArray();
    setProducts(all);
    const stockSetting = await db.settings.get('stockSettings');
    setLowStockThreshold(stockSetting?.value?.lowStockThreshold ?? 10);
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    return !q ||
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q);
  });

  async function openAdd() {
    const code = await getNextProductCode();
    setForm({ code, barcode: '', name: '', description: '', price: '', unit: 'ชิ้น', category: '', stock: '' });
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
      stock: product.stock?.toString() || '0',
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
    try {
      const data = { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) || 0 };
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
    setForm(prev => ({ ...prev, barcode }));
    setShowScanner(false);
    if (!showModal) {
      openAdd();
    }
  }

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
            <button className="btn btn-primary" onClick={openAdd}>
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
    </>
  );
}
