import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import {
  db, initializeSettings, exportBackup,
  autoBackupSupported, setAutoBackupDir, clearAutoBackupDir,
  getAutoBackupStatus, runAutoBackup
} from '../db/database';
import { useApp } from '../context/AppContext';
import {
  Save, Building2, CreditCard, FileText, Upload, Download,
  RefreshCw, AlertTriangle, Image, Database
} from 'lucide-react';
import { storageMode, setStorageMode, getPbUrl, setPbUrl, pingPb } from '../db/pocketbase';
import { isTauri } from '../db/sqlStore';
import { checkForUpdate, installUpdate } from '../utils/updater';

export default function Settings() {
  const { showToast } = useApp();

  const [company, setCompany] = useState({
    name: '', nameEn: '', address: '', taxId: '', branchCode: '00000',
    phone: '', mobile: '', email: '', website: '', logo: null
  });
  const [bank, setBank] = useState({
    bankName: '', accountName: '', accountNumber: '', promptPayId: ''
  });
  const [invoice, setInvoice] = useState({
    prefix: 'INV', nextNumber: 1, vatRate: 7,
    includeVat: true, dateFormat: 'th', documentType: 'both'
  });
  const [stock, setStock] = useState({
    trackStock: true, lowStockThreshold: 10, showStockWarning: true
  });

  const [activeTab, setActiveTab] = useState('company');
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [autoBackup, setAutoBackup] = useState({ configured: false });
  const [storeMode, setStoreMode] = useState(storageMode());
  const [pbUrl, setPbUrlState] = useState(getPbUrl());
  const [pbStatus, setPbStatus] = useState(null); // null | 'checking' | 'ok' | 'fail'
  const [update, setUpdate] = useState(null); // { available, version, notes, update } | { available:false }
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    await initializeSettings();
    const companySetting = await db.settings.get('company');
    const bankSetting = await db.settings.get('bank');
    const invSetting = await db.settings.get('invoice');
    const stockSetting = await db.settings.get('stockSettings');
    const backupSetting = await db.settings.get('lastBackupAt');

    if (companySetting) setCompany(companySetting.value);
    if (bankSetting) setBank(bankSetting.value);
    if (invSetting) setInvoice(invSetting.value);
    if (stockSetting) setStock(stockSetting.value);
    setLastBackupAt(backupSetting?.value || null);
    setAutoBackup(await getAutoBackupStatus());
  }

  async function handlePickBackupFolder() {
    try {
      await setAutoBackupDir();
      showToast('ตั้งค่าสำรองอัตโนมัติสำเร็จ — สำรองไฟล์แรกแล้ว');
      loadSettings();
    } catch (err) {
      if (err?.name !== 'AbortError') showToast('ตั้งค่าไม่สำเร็จ: ' + err.message, 'error');
    }
  }

  async function handleRunAutoBackupNow() {
    try {
      const ok = await runAutoBackup();
      showToast(ok ? 'สำรองข้อมูลลงโฟลเดอร์สำเร็จ' : 'ไม่ได้รับสิทธิ์เข้าถึงโฟลเดอร์', ok ? 'success' : 'error');
      loadSettings();
    } catch (err) {
      showToast('สำรองไม่สำเร็จ: ' + err.message, 'error');
    }
  }

  async function handleDisableAutoBackup() {
    await clearAutoBackupDir();
    showToast('ปิดการสำรองอัตโนมัติแล้ว');
    loadSettings();
  }

  async function handleTestPb() {
    setPbStatus('checking');
    setPbUrl(pbUrl);
    const ok = await pingPb();
    setPbStatus(ok ? 'ok' : 'fail');
    showToast(ok ? 'เชื่อมต่อ PocketBase สำเร็จ' : 'เชื่อมต่อไม่ได้ — เช็คว่า server รันอยู่และ URL ถูก', ok ? 'success' : 'error');
  }

  function handleApplyStorage() {
    setPbUrl(pbUrl);
    setStorageMode(storeMode);
    showToast('บันทึกแล้ว — กำลังรีโหลดเพื่อใช้ที่เก็บข้อมูลใหม่');
    setTimeout(() => window.location.reload(), 900);
  }

  async function handleCheckUpdate() {
    setUpdateBusy(true);
    try {
      const res = await checkForUpdate();
      setUpdate(res);
      if (res.available) showToast(`มีเวอร์ชันใหม่ ${res.version}`);
      else if (res.supported) showToast('ใช้เวอร์ชันล่าสุดอยู่แล้ว');
    } catch (err) {
      showToast('ตรวจอัปเดตไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleInstallUpdate() {
    if (!update?.update) return;
    setUpdateBusy(true);
    try {
      showToast('กำลังดาวน์โหลดและติดตั้ง... แอปจะรีสตาร์ทเอง');
      await installUpdate(update.update);
    } catch (err) {
      showToast('อัปเดตไม่สำเร็จ: ' + err.message, 'error');
      setUpdateBusy(false);
    }
  }

  async function handleSave() {
    try {
      await db.settings.put({ key: 'company', value: company });
      await db.settings.put({ key: 'bank', value: bank });
      await db.settings.put({ key: 'invoice', value: invoice });
      await db.settings.put({ key: 'stockSettings', value: stock });
      showToast('บันทึกการตั้งค่าสำเร็จ');
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
  }

  // Export all data as JSON (every table) and record the backup time
  async function handleExport() {
    await exportBackup();
    loadSettings();
    showToast('ส่งออกข้อมูลสำเร็จ');
  }

  // Import data from JSON — validates the file and snapshots current data first.
  async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 1) Parse + validate BEFORE touching anything (a bad file must not wipe data).
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      showToast('ไฟล์เสียหาย — อ่าน JSON ไม่ได้ ไม่มีการเปลี่ยนแปลงข้อมูล', 'error');
      event.target.value = '';
      return;
    }
    const TABLES = ['customers', 'products', 'invoices', 'quotations', 'creditNotes', 'stockLogs'];
    const present = TABLES.filter(t => Array.isArray(data?.[t]));
    if (!data || typeof data !== 'object' || (present.length === 0 && !Array.isArray(data.settings))) {
      showToast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Billdee — ไม่มีการเปลี่ยนแปลงข้อมูล', 'error');
      event.target.value = '';
      return;
    }

    if (!window.confirm('การนำเข้าจะเขียนทับข้อมูลเดิมทั้งหมด\nระบบจะ "สำรองข้อมูลปัจจุบันเป็นไฟล์" ให้ก่อนเพื่อความปลอดภัย แล้วจึงนำเข้า\nต้องการดำเนินการต่อหรือไม่?')) {
      event.target.value = '';
      return;
    }

    try {
      // 2) Safety snapshot of current data before overwriting.
      try { await exportBackup(); } catch { /* non-fatal */ }

      // 3) Restore only fields that are valid arrays.
      const strip = (rows) => rows.map(r => { const { id, ...rest } = r; return rest; });
      for (const t of present) {
        await db[t].clear();
        await db[t].bulkAdd(strip(data[t]));
      }
      if (Array.isArray(data.settings)) {
        for (const s of data.settings) {
          if (s.key === 'autoBackupDir') continue; // machine-specific, never restore
          await db.settings.put(s);
        }
      }

      showToast('นำเข้าข้อมูลสำเร็จ');
      loadSettings();
    } catch (err) {
      showToast('เกิดข้อผิดพลาดระหว่างนำเข้า: ' + err.message, 'error');
    }
    event.target.value = '';
  }

  // Handle logo upload
  function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setCompany({ ...company, logo: e.target.result });
    };
    reader.readAsDataURL(file);
  }

  const tabs = [
    { id: 'company', label: 'ข้อมูลบริษัท', icon: Building2 },
    { id: 'bank', label: 'บัญชีธนาคาร', icon: CreditCard },
    { id: 'invoice', label: 'ใบเสร็จ', icon: FileText },
    { id: 'backup', label: 'สำรอง/กู้คืน', icon: RefreshCw },
    { id: 'storage', label: 'ที่เก็บข้อมูล', icon: Database },
  ];

  return (
    <>
      <Header
        title="ตั้งค่า"
        subtitle="จัดการข้อมูลบริษัทและการตั้งค่าระบบ"
        actions={
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={18} /> บันทึก
          </button>
        }
      />
      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', maxWidth: '900px' }}>
          {/* Tab Nav */}
          <div className="card" style={{ height: 'fit-content' }}>
            <div style={{ padding: '8px' }}>
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={`sidebar-link ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      background: activeTab === tab.id ? 'var(--color-primary-50)' : 'transparent',
                      color: activeTab === tab.id ? 'var(--color-primary-700)' : 'var(--color-gray-600)',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: activeTab === tab.id ? 700 : 500,
                    }}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="card">
            <div className="card-body">
              {activeTab === 'company' && (
                <>
                  <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>ข้อมูลบริษัท</h3>

                  {/* Logo */}
                  <div className="form-group">
                    <label className="form-label">โลโก้บริษัท</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {company.logo ? (
                        <img src={company.logo} alt="Logo" style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-200)' }} />
                      ) : (
                        <div style={{ width: '80px', height: '80px', background: 'var(--color-gray-100)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Image size={24} color="var(--color-gray-400)" />
                        </div>
                      )}
                      <div>
                        <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer' }}>
                          <Upload size={14} /> อัพโหลดโลโก้
                          <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                        </label>
                        {company.logo && (
                          <button className="btn btn-sm btn-ghost" onClick={() => setCompany({ ...company, logo: null })}>
                            ลบ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">ชื่อบริษัท (ไทย) <span className="required">*</span></label>
                      <input type="text" className="form-input" value={company.name}
                        onChange={e => setCompany({ ...company, name: e.target.value })}
                        placeholder="บริษัท xxxxxxx จำกัด" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">ชื่อบริษัท (อังกฤษ)</label>
                      <input type="text" className="form-input" value={company.nameEn}
                        onChange={e => setCompany({ ...company, nameEn: e.target.value })}
                        placeholder="Company Name Co., Ltd." />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">เลขประจำตัวผู้เสียภาษี</label>
                      <input type="text" className="form-input" value={company.taxId}
                        onChange={e => setCompany({ ...company, taxId: e.target.value })}
                        placeholder="0000000000000" maxLength={13} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">รหัสสาขา</label>
                      <input type="text" className="form-input" value={company.branchCode ?? '00000'}
                        onChange={e => setCompany({ ...company, branchCode: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                        placeholder="00000" maxLength={5} style={{ maxWidth: '150px' }} />
                      <p className="form-help">
                        {(!company.branchCode || company.branchCode === '00000')
                          ? 'สำนักงานใหญ่ (กรอกตอนจดบริษัทแล้ว)'
                          : `สาขาที่ ${company.branchCode}`}
                      </p>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ที่อยู่</label>
                    <textarea className="form-textarea" value={company.address}
                      onChange={e => setCompany({ ...company, address: e.target.value })}
                      placeholder="ที่อยู่สำหรับออกใบเสร็จ" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">เบอร์โทรศัพท์</label>
                      <input type="tel" className="form-input" value={company.phone}
                        onChange={e => setCompany({ ...company, phone: e.target.value })}
                        placeholder="02-xxx-xxxx" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">มือถือ</label>
                      <input type="tel" className="form-input" value={company.mobile}
                        onChange={e => setCompany({ ...company, mobile: e.target.value })}
                        placeholder="08x-xxx-xxxx" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">อีเมล</label>
                      <input type="email" className="form-input" value={company.email}
                        onChange={e => setCompany({ ...company, email: e.target.value })}
                        placeholder="info@company.com" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">เว็บไซต์</label>
                      <input type="url" className="form-input" value={company.website}
                        onChange={e => setCompany({ ...company, website: e.target.value })}
                        placeholder="https://..." />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'bank' && (
                <>
                  <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>ข้อมูลบัญชีธนาคาร</h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginBottom: '20px' }}>
                    ข้อมูลนี้จะแสดงในใบเสร็จเมื่อเลือกช่องทางชำระ "โอนเงิน"
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">ธนาคาร</label>
                      <select className="form-select" value={bank.bankName}
                        onChange={e => setBank({ ...bank, bankName: e.target.value })}>
                        <option value="">เลือกธนาคาร</option>
                        <option value="ธนาคารกสิกรไทย">กสิกรไทย (KBank)</option>
                        <option value="ธนาคารกรุงเทพ">กรุงเทพ (BBL)</option>
                        <option value="ธนาคารกรุงไทย">กรุงไทย (KTB)</option>
                        <option value="ธนาคารไทยพาณิชย์">ไทยพาณิชย์ (SCB)</option>
                        <option value="ธนาคารกรุงศรีอยุธยา">กรุงศรีอยุธยา (BAY)</option>
                        <option value="ธนาคารทหารไทยธนชาต">ทหารไทยธนชาต (TTB)</option>
                        <option value="ธนาคารออมสิน">ออมสิน (GSB)</option>
                        <option value="ธนาคาร ธ.ก.ส.">ธ.ก.ส. (BAAC)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">ชื่อบัญชี</label>
                      <input type="text" className="form-input" value={bank.accountName}
                        onChange={e => setBank({ ...bank, accountName: e.target.value })}
                        placeholder="ชื่อบัญชี" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">เลขที่บัญชี</label>
                      <input type="text" className="form-input" value={bank.accountNumber}
                        onChange={e => setBank({ ...bank, accountNumber: e.target.value })}
                        placeholder="xxx-x-xxxxx-x" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">PromptPay ID</label>
                      <input type="text" className="form-input" value={bank.promptPayId}
                        onChange={e => setBank({ ...bank, promptPayId: e.target.value })}
                        placeholder="เลขบัตรประชาชน หรือ เบอร์โทร" />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'invoice' && (
                <>
                  <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>ตั้งค่าใบเสร็จ</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">คำนำหน้าเลขที่เอกสาร</label>
                      <input type="text" className="form-input" value={invoice.prefix}
                        onChange={e => setInvoice({ ...invoice, prefix: e.target.value })}
                        placeholder="INV" style={{ maxWidth: '150px' }} />
                      <p className="form-help">ตัวอย่าง: {invoice.prefix}-{String(invoice.nextNumber).padStart(6, '0')}</p>
                    </div>
                    <div className="form-group">
                      <label className="form-label">เลขลำดับถัดไป</label>
                      <input type="number" className="form-input" value={invoice.nextNumber}
                        onChange={e => setInvoice({ ...invoice, nextNumber: parseInt(e.target.value) || 1 })}
                        min="1" style={{ maxWidth: '150px' }} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">อัตราภาษี VAT (%)</label>
                      <input type="number" className="form-input" value={invoice.vatRate}
                        onChange={e => setInvoice({ ...invoice, vatRate: parseFloat(e.target.value) || 0 })}
                        min="0" max="100" step="0.5" style={{ maxWidth: '150px' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">รูปแบบวันที่</label>
                      <select className="form-select" value={invoice.dateFormat}
                        onChange={e => setInvoice({ ...invoice, dateFormat: e.target.value })}>
                        <option value="th">พ.ศ. (ไทย)</option>
                        <option value="en">ค.ศ. (สากล)</option>
                      </select>
                    </div>
                  </div>

                  <h3 style={{ margin: '28px 0 16px', fontWeight: 700 }}>การติดตามสต็อก</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">แจ้งเตือนเมื่อสต็อกเหลือน้อยกว่าหรือเท่ากับ</label>
                      <input type="number" className="form-input" value={stock.lowStockThreshold}
                        onChange={e => setStock({ ...stock, lowStockThreshold: parseInt(e.target.value) || 0 })}
                        min="0" style={{ maxWidth: '150px' }} />
                      <p className="form-help">ใช้กับแดชบอร์ดและหน้าสินค้า (ปัจจุบัน {stock.lowStockThreshold} ชิ้น)</p>
                    </div>
                    <div className="form-group">
                      <label className="form-label">แสดงการแจ้งเตือนสต็อก</label>
                      <select className="form-select"
                        value={stock.showStockWarning ? 'yes' : 'no'}
                        onChange={e => setStock({ ...stock, showStockWarning: e.target.value === 'yes' })}>
                        <option value="yes">แสดง</option>
                        <option value="no">ไม่แสดง</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'backup' && (
                <>
                  <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>สำรอง & กู้คืนข้อมูล</h3>
                  <div style={{
                    padding: '16px',
                    background: 'var(--color-warning-50)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '24px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start'
                  }}>
                    <AlertTriangle size={20} color="var(--color-warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '13px' }}>
                      <strong>สำคัญ!</strong> ข้อมูลทั้งหมดเก็บไว้ในเบราว์เซอร์ของคุณ
                      หากล้างข้อมูลเบราว์เซอร์ ข้อมูลจะหายไป กรุณาสำรองข้อมูลเป็นประจำ
                      <div style={{ marginTop: '8px', fontWeight: 600 }}>
                        สำรองข้อมูลล่าสุด: {lastBackupAt
                          ? new Date(lastBackupAt).toLocaleString('th-TH')
                          : 'ยังไม่เคยสำรอง'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="card" style={{ border: '2px dashed var(--color-gray-300)' }}>
                      <div className="card-body" style={{ textAlign: 'center', padding: '32px' }}>
                        <Download size={36} color="var(--color-primary-500)" style={{ margin: '0 auto 12px' }} />
                        <h4 style={{ marginBottom: '8px' }}>ส่งออกข้อมูล</h4>
                        <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginBottom: '16px' }}>
                          ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ JSON
                        </p>
                        <button className="btn btn-primary" onClick={handleExport}>
                          <Download size={18} /> ส่งออก (Export)
                        </button>
                      </div>
                    </div>

                    <div className="card" style={{ border: '2px dashed var(--color-gray-300)' }}>
                      <div className="card-body" style={{ textAlign: 'center', padding: '32px' }}>
                        <Upload size={36} color="var(--color-accent-500)" style={{ margin: '0 auto 12px' }} />
                        <h4 style={{ marginBottom: '8px' }}>นำเข้าข้อมูล</h4>
                        <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginBottom: '16px' }}>
                          นำเข้าจากไฟล์ JSON ที่สำรองไว้
                        </p>
                        <label className="btn btn-accent" style={{ cursor: 'pointer' }}>
                          <Upload size={18} /> นำเข้า (Import)
                          <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Auto-backup to folder */}
                  <div className="card" style={{ marginTop: '20px', border: '2px solid var(--color-primary-200)' }}>
                    <div className="card-body">
                      <h4 style={{ marginBottom: '8px' }}>🔄 สำรองอัตโนมัติลงโฟลเดอร์ (แนะนำ)</h4>
                      <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginBottom: '16px' }}>
                        เลือกโฟลเดอร์ปลายทางครั้งเดียว (เช่น USB drive หรือโฟลเดอร์ที่ sync กับ Google Drive)
                        ระบบจะเขียนไฟล์สำรองให้อัตโนมัติวันละครั้งเมื่อเปิดใช้งาน
                      </p>
                      {!autoBackupSupported() ? (
                        <p style={{ fontSize: '13px', color: 'var(--color-warning-600)' }}>
                          เบราว์เซอร์นี้ไม่รองรับ — กรุณาใช้ Chrome หรือ Edge
                        </p>
                      ) : autoBackup.configured ? (
                        <>
                          <div style={{ fontSize: '13px', marginBottom: '12px' }}>
                            <div>📁 โฟลเดอร์: <strong>{autoBackup.folderName}</strong></div>
                            <div>🕐 สำรองอัตโนมัติล่าสุด: <strong>{autoBackup.lastAutoBackupAt
                              ? new Date(autoBackup.lastAutoBackupAt).toLocaleString('th-TH')
                              : 'ยังไม่เคย'}</strong></div>
                            {autoBackup.permission !== 'granted' && (
                              <div style={{ color: 'var(--color-warning-600)', marginTop: '4px' }}>
                                ⚠️ ต้องกดยืนยันสิทธิ์อีกครั้งหลังเปิดเบราว์เซอร์ใหม่ — กด "สำรองเดี๋ยวนี้"
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button className="btn btn-sm btn-primary" onClick={handleRunAutoBackupNow}>
                              <Download size={16} /> สำรองเดี๋ยวนี้
                            </button>
                            <button className="btn btn-sm btn-outline" onClick={handlePickBackupFolder}>
                              เปลี่ยนโฟลเดอร์
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={handleDisableAutoBackup}>
                              ปิดการสำรองอัตโนมัติ
                            </button>
                          </div>
                        </>
                      ) : (
                        <button className="btn btn-primary" onClick={handlePickBackupFolder}>
                          📁 เลือกโฟลเดอร์สำรองอัตโนมัติ
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'storage' && (
                <>
                  <h3 style={{ marginBottom: '8px', fontWeight: 700 }}>ที่เก็บข้อมูล</h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginBottom: '20px' }}>
                    ค่าเริ่มต้นคือ <strong>ในเครื่อง (IndexedDB)</strong> — เหมาะกับใช้เครื่องเดียว
                    เปลี่ยนเป็น <strong>PocketBase</strong> เมื่อต้องการให้หลายเครื่องในโรงงานใช้ข้อมูลชุดเดียวกัน
                    (ต้องมี PocketBase server รันอยู่ — ดูวิธีตั้งใน README-POCKETBASE.md)
                  </p>

                  <div style={{
                    padding: '14px 16px', background: 'var(--color-warning-50)',
                    borderRadius: 'var(--radius-md)', marginBottom: '20px', fontSize: '13px',
                    display: 'flex', gap: '10px', alignItems: 'flex-start'
                  }}>
                    <AlertTriangle size={18} color="var(--color-warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>ก่อนสลับมา PocketBase: <strong>ส่งออก (Export) ข้อมูลปัจจุบันเก็บไว้ก่อน</strong> แล้วค่อยสลับ →
                      รีโหลด → เข้ามาที่แท็บสำรอง/กู้คืน กด <strong>นำเข้า (Import)</strong> ไฟล์ที่เพิ่งส่งออก
                      เพื่อย้ายข้อมูลขึ้น PocketBase</div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">เก็บข้อมูลที่</label>
                    <select className="form-select" value={storeMode}
                      onChange={e => setStoreMode(e.target.value)} style={{ maxWidth: '360px' }}>
                      <option value="indexeddb">ในเครื่อง — IndexedDB (ค่าเริ่มต้น)</option>
                      <option value="pocketbase">PocketBase server</option>
                    </select>
                  </div>

                  {storeMode === 'pocketbase' && (
                    <div className="form-group">
                      <label className="form-label">PocketBase URL</label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input type="text" className="form-input" value={pbUrl}
                          onChange={e => { setPbUrlState(e.target.value); setPbStatus(null); }}
                          placeholder="http://127.0.0.1:8090" style={{ maxWidth: '360px' }} />
                        <button className="btn btn-outline" onClick={handleTestPb}>ทดสอบการเชื่อมต่อ</button>
                      </div>
                      <p className="form-help">
                        {pbStatus === 'checking' && 'กำลังเชื่อมต่อ...'}
                        {pbStatus === 'ok' && '✅ เชื่อมต่อได้'}
                        {pbStatus === 'fail' && '❌ เชื่อมต่อไม่ได้ — เช็คว่า server รันอยู่และ URL ถูก'}
                        {pbStatus === null && 'เครื่องลูกในโรงงานให้ใส่ IP ของเครื่องแม่ เช่น http://192.168.1.50:8090'}
                      </p>
                    </div>
                  )}

                  <button className="btn btn-primary" onClick={handleApplyStorage} style={{ marginTop: '8px' }}>
                    <Save size={18} /> บันทึกและรีโหลด
                  </button>

                  {isTauri() && (
                    <div className="card" style={{ marginTop: '28px', border: '1px solid var(--color-primary-200)' }}>
                      <div className="card-body">
                        <h4 style={{ marginBottom: '8px' }}>⬆️ อัปเดตโปรแกรม</h4>
                        <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginBottom: '16px' }}>
                          ตรวจหาเวอร์ชันใหม่จาก GitHub แล้วกดอัปเดตได้ในแอปเลย — โปรแกรมจะดาวน์โหลด ติดตั้ง และรีสตาร์ทให้อัตโนมัติ (ข้อมูลไม่หาย)
                        </p>
                        {update?.available ? (
                          <div>
                            <div style={{ fontSize: '14px', marginBottom: '12px' }}>
                              🎉 มีเวอร์ชันใหม่: <strong>{update.version}</strong>
                              {update.notes && (
                                <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{update.notes}</div>
                              )}
                            </div>
                            <button className="btn btn-primary" onClick={handleInstallUpdate} disabled={updateBusy}>
                              <Download size={18} /> {updateBusy ? 'กำลังอัปเดต...' : 'อัปเดตเดี๋ยวนี้'}
                            </button>
                          </div>
                        ) : (
                          <button className="btn btn-outline" onClick={handleCheckUpdate} disabled={updateBusy}>
                            <RefreshCw size={18} /> {updateBusy ? 'กำลังตรวจสอบ...' : 'ตรวจหาอัปเดต'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
