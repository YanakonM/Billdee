// Thai Baht text conversion
const DIGITS = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
const POSITIONS = ['','สิบ','ร้อย','พัน','หมื่น','แสน'];

// Read a 0..999999 chunk. `hasHigher` = true when a higher-order group
// (millions and above) precedes this chunk, so a trailing 1 becomes "เอ็ด".
function readChunk(n, hasHigher) {
  let result = '';
  const numStr = String(n);
  const len = numStr.length;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i]);
    const pos = len - i - 1;

    if (digit === 0) continue;

    if (pos === 0 && digit === 1 && (len > 1 || hasHigher)) {
      result += 'เอ็ด';
    } else if (pos === 1 && digit === 1) {
      result += 'สิบ';
    } else if (pos === 1 && digit === 2) {
      result += 'ยี่สิบ';
    } else {
      result += DIGITS[digit] + POSITIONS[pos];
    }
  }

  return result;
}

function numberToThaiText(num) {
  num = Math.floor(num);
  if (num === 0) return 'ศูนย์';

  // Split into groups of 6 digits (millions), low group first.
  const groups = [];
  while (num > 0) {
    groups.push(num % 1000000);
    num = Math.floor(num / 1000000);
  }

  let result = '';
  let higher = false; // a higher-order (millions+) group has already been emitted
  for (let g = groups.length - 1; g >= 0; g--) {
    if (groups[g] === 0) continue;
    result += readChunk(groups[g], higher);
    if (g > 0) result += 'ล้าน';
    higher = true;
  }

  return result;
}

export function bahtText(amount) {
  const parts = Math.abs(amount).toFixed(2).split('.');
  const baht = parseInt(parts[0]);
  const satang = parseInt(parts[1]);

  // Zero — including tiny amounts that round to 0.00 — reads as full zero baht.
  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน';

  let result = '';
  if (amount < 0) result += 'ลบ';

  if (baht > 0) {
    result += numberToThaiText(baht) + 'บาท';
  }

  if (satang > 0) {
    result += numberToThaiText(satang) + 'สตางค์';
  } else {
    result += 'ถ้วน';
  }

  return result;
}

// Format number with commas
export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  return Number(num).toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Format currency
export function formatCurrency(num) {
  return `฿${formatNumber(num)}`;
}

// Validate a Thai 13-digit Tax ID using the official check-digit algorithm.
export function isValidThaiTaxId(id) {
  const s = (id ?? '').toString().replace(/\D/g, '');
  if (s.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(s[i], 10) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(s[12], 10);
}

// Thai tax-invoice branch label from a 5-digit branch code.
// '00000' (or empty) = head office; anything else = a numbered branch.
export function formatBranch(code) {
  const c = (code ?? '').toString().trim();
  if (!c || c === '00000' || c === '0') return 'สำนักงานใหญ่';
  return `สาขาที่ ${c.padStart(5, '0')}`;
}

// Date era — 'th' = Buddhist Era (พ.ศ.), 'en' = Gregorian (ค.ศ.).
// Set from the invoice settings (dateFormat); cached in localStorage so the
// very first paint after app start already uses the right era (the settings
// table is async and loads after the first render).
let _dateEra = (() => {
  try { return localStorage.getItem('dateEra') === 'en' ? 'en' : 'th'; } catch { return 'th'; }
})();
export function setDateEra(era) {
  _dateEra = era === 'en' ? 'en' : 'th';
  try { localStorage.setItem('dateEra', _dateEra); } catch { /* ignore */ }
}
function displayYearValue(year) {
  return _dateEra === 'th' ? year + 543 : year;
}

function readDateParts(date) {
  if (!date) return null;
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) return null;
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  const text = String(date).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    return isValidDateParts(year, month, day) ? { year, month, day } : null;
  }

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function normalizeDateDigits(value) {
  const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
  return String(value ?? '').replace(/[๐-๙]/g, ch => String(thaiDigits.indexOf(ch))).trim();
}

// Format date to Thai form (DD/MM/YYYY, year follows the configured era)
export function formatDateThai(date) {
  const parts = readDateParts(date);
  if (!parts) return '';
  const day = String(parts.day).padStart(2, '0');
  const month = String(parts.month).padStart(2, '0');
  return `${day}/${month}/${displayYearValue(parts.year)}`;
}


// Format date short
export function formatDateShort(date) {
  const parts = readDateParts(date);
  if (!parts) return '';
  const day = String(parts.day).padStart(2, '0');
  const month = String(parts.month).padStart(2, '0');
  return `${day}/${month}/${displayYearValue(parts.year)}`;
}

// Date input display is always Thai Buddhist Era (พ.ศ.) while stored values stay ISO YYYY-MM-DD.
export function formatDateInputThai(date) {
  const parts = readDateParts(date);
  if (!parts) return '';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year + 543}`;
}

export function parseDateInputThai(value) {
  const text = normalizeDateDigits(value);
  if (!text) return '';

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    return isValidDateParts(year, month, day)
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : '';
  }

  let parts = text.split(/[\/\-. ]+/).filter(Boolean);
  if (parts.length === 1 && /^\d{8}$/.test(parts[0])) {
    parts = [parts[0].slice(0, 2), parts[0].slice(2, 4), parts[0].slice(4)];
  }
  if (parts.length !== 3) return '';
  if (!parts.every(part => /^\d+$/.test(part))) return '';

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const inputYear = parseInt(parts[2], 10);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(inputYear)) return '';

  const year = inputYear >= 2400 ? inputYear - 543 : inputYear;
  if (!isValidDateParts(year, month, day)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Today's date as YYYY-MM-DD in LOCAL time. (toISOString converts to UTC —
// in Thailand (UTC+7) that returned yesterday's date for any bill issued
// before 07:00.)
export function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Format any Date as a local YYYY-MM-DD key (same rationale as getToday).
export function toLocalDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Generate unique ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Escape user text before interpolating it into print-HTML strings.
// Product names / customer names / notes containing < > & " would otherwise
// break (or inject markup into) the printed document.
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
