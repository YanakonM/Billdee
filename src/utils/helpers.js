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
  if (amount === 0) return 'ศูนย์บาทถ้วน';
  
  const parts = Math.abs(amount).toFixed(2).split('.');
  const baht = parseInt(parts[0]);
  const satang = parseInt(parts[1]);
  
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

// Format date to Thai Buddhist Era
export function formatDateThai(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = d.getDate();
  const months = [
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

// Format date short
export function formatDateShort(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

// Get today's date as ISO string
export function getToday() {
  return new Date().toISOString().split('T')[0];
}

// Generate unique ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
