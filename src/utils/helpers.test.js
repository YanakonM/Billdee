import { describe, it, expect } from 'vitest';
import {
  bahtText, formatNumber, isValidThaiTaxId, formatBranch,
  escapeHtml, toLocalDateKey, setDateEra, formatDateShort, formatDateThai,
  formatDateInputThai, parseDateInputThai,
} from './helpers.js';

describe('bahtText — จำนวนเงินเป็นตัวหนังสือไทย', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [0.004, 'ศูนย์บาทถ้วน'],            // rounds to 0.00 — regression for the "ถ้วน"-only bug
    [0.25, 'ยี่สิบห้าสตางค์'],
    [1.5, 'หนึ่งบาทห้าสิบสตางค์'],
    [11, 'สิบเอ็ดบาทถ้วน'],
    [20, 'ยี่สิบบาทถ้วน'],
    [21, 'ยี่สิบเอ็ดบาทถ้วน'],
    [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [224.7, 'สองร้อยยี่สิบสี่บาทเจ็ดสิบสตางค์'],
    [1000000, 'หนึ่งล้านบาทถ้วน'],
    [1000001, 'หนึ่งล้านเอ็ดบาทถ้วน'],
    [1234567.89, 'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์'],
    [100000000, 'หนึ่งร้อยล้านบาทถ้วน'],
    [-5, 'ลบห้าบาทถ้วน'],
  ])('bahtText(%s) → %s', (input, expected) => {
    expect(bahtText(input)).toBe(expected);
  });
});

describe('isValidThaiTaxId — ตรวจ check digit เลขผู้เสียภาษี 13 หลัก', () => {
  it('รับเลขที่ check digit ถูกต้อง', () => {
    expect(isValidThaiTaxId('0105545096174')).toBe(true);
  });
  it('รับเลขที่มีขีดคั่น (ล้างอักขระที่ไม่ใช่ตัวเลขก่อน)', () => {
    expect(isValidThaiTaxId('0-1055-45096-17-4')).toBe(true);
  });
  it.each([
    ['1234567890123', 'check digit ผิด'],
    ['0123456789012', 'ค่า placeholder เดิมของแอป (ผิด)'],
    ['12345', 'สั้นเกินไป'],
    ['', 'ค่าว่าง'],
    [null, 'null'],
  ])('ปฏิเสธ %s (%s)', (input) => {
    expect(isValidThaiTaxId(input)).toBe(false);
  });
});

describe('formatBranch — ป้ายสาขาบนใบกำกับภาษี', () => {
  it.each([
    ['00000', 'สำนักงานใหญ่'],
    ['', 'สำนักงานใหญ่'],
    [null, 'สำนักงานใหญ่'],
    ['1', 'สาขาที่ 00001'],
    ['00012', 'สาขาที่ 00012'],
  ])('formatBranch(%s) → %s', (input, expected) => {
    expect(formatBranch(input)).toBe(expected);
  });
});

describe('escapeHtml — กัน markup หลุดเข้าเอกสารพิมพ์', () => {
  it('escape อักขระอันตรายครบ', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">&\'')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
  });
  it('ค่าปกติผ่านไม่เปลี่ยน + ทนค่า null/ตัวเลข', () => {
    expect(escapeHtml('ปูนซีเมนต์ ตราช้าง 50กก.')).toBe('ปูนซีเมนต์ ตราช้าง 50กก.');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('toLocalDateKey — วันที่แบบ local (กัน UTC+7 ถอยวัน)', () => {
  it('เที่ยงคืนครึ่งเวลาไทยยังเป็นวันเดิม (toISOString จะถอยไปเมื่อวาน)', () => {
    const d = new Date(2026, 6, 2, 0, 30); // 2 ก.ค. 2026 00:30 local
    expect(toLocalDateKey(d)).toBe('2026-07-02');
  });
  it('pad เดือน/วัน 2 หลัก', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatDateShort + setDateEra — พ.ศ./ค.ศ. มีผลจริง', () => {
  it('ค่าเริ่มต้นเป็น พ.ศ.', () => {
    setDateEra('th');
    expect(formatDateShort('2026-07-02')).toBe('02/07/2569');
  });
  it('สลับเป็น ค.ศ. แล้วปีเปลี่ยน', () => {
    setDateEra('en');
    expect(formatDateShort('2026-07-02')).toBe('02/07/2026');
    setDateEra('th'); // restore for other tests
  });
});

describe('formatDateThai — ปรับวันที่เป็น ว/ด/ป แล้วเป็นพ.ศ.', () => {
  it('ค่าเริ่มต้นเป็น พ.ศ. (ว/ด/ป)', () => {
    setDateEra('th');
    expect(formatDateThai('2026-07-02')).toBe('02/07/2569');
  });
  it('สลับเป็น ค.ศ. แล้วแสดงเป็น ค.ศ. (ว/ด/ป)', () => {
    setDateEra('en');
    expect(formatDateThai('2026-07-02')).toBe('02/07/2026');
    setDateEra('th'); // restore for other tests
  });
});

describe('Thai date input — แสดง พ.ศ. แต่เก็บ ISO', () => {
  it('format เป็น วว/ดด/พ.ศ. เสมอ แม้ตั้งค่าการพิมพ์เป็น ค.ศ.', () => {
    setDateEra('en');
    expect(formatDateInputThai('2026-07-15')).toBe('15/07/2569');
    setDateEra('th');
  });

  it.each([
    ['15/07/2569', '2026-07-15'],
    ['15/7/2026', '2026-07-15'],
    ['๑๕/๐๗/๒๕๖๙', '2026-07-15'],
    ['15072569', '2026-07-15'],
    ['2026-07-15', '2026-07-15'],
  ])('parse %s → %s', (input, expected) => {
    expect(parseDateInputThai(input)).toBe(expected);
  });

  it('ไม่รับวันที่ที่ไม่มีจริง', () => {
    expect(parseDateInputThai('31/02/2569')).toBe('');
  });
});


describe('formatNumber', () => {
  it('ค่า null/undefined/NaN → "0.00"', () => {
    expect(formatNumber(null)).toBe('0.00');
    expect(formatNumber(undefined)).toBe('0.00');
    expect(formatNumber(NaN)).toBe('0.00');
  });
});
