import { describe, it, expect } from 'vitest';
import { generatePromptPayPayload } from './promptpay.js';

// Independent CRC-16/CCITT-FALSE implementation (spec-defined) so a change in
// the production copy can't silently agree with itself.
function crc16Independent(str) {
  let crc = 0xFFFF;
  for (const ch of str) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

describe('generatePromptPayPayload — EMV QR ตามสเปคธนาคารแห่งประเทศไทย', () => {
  it('เบอร์โทร ไม่ระบุยอด (QR แบบใช้ซ้ำ) — golden', () => {
    expect(generatePromptPayPayload('0812345678')).toBe(
      '00020101021129370016A0000006770101110113006681234567853037645802TH6304823E');
  });

  it('เบอร์โทรมีขีด + ยอดเงิน (QR ครั้งเดียว) — golden', () => {
    expect(generatePromptPayPayload('081-234-5678', 224.70)).toBe(
      '00020101021229370016A0000006770101110113006681234567853037645406224.705802TH6304A138');
  });

  it('เลขผู้เสียภาษี 13 หลัก + ยอดเงิน — golden', () => {
    expect(generatePromptPayPayload('0105545096174', 1000)).toBe(
      '00020101021229370016A00000067701011102130105545096174530376454071000.005802TH63040747');
  });

  it('CRC ท้าย payload ตรงกับการคำนวณอิสระ', () => {
    const payload = generatePromptPayPayload('0899999999', 50);
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16Independent(body));
  });

  it('เบอร์โทรถูกแปลงเป็น 0066 + 9 หลัก (ตัด 0 นำหน้า)', () => {
    expect(generatePromptPayPayload('0812345678')).toContain('00668123456785');
  });

  it('มียอด → dynamic (010212) + tag 54 / ไม่มียอด → static (010211) ไม่มี tag 54', () => {
    const withAmount = generatePromptPayPayload('0812345678', 100);
    const noAmount = generatePromptPayPayload('0812345678');
    expect(withAmount).toContain('010212');
    expect(withAmount).toContain('5406100.00');
    expect(noAmount).toContain('010211');
    expect(noAmount).not.toContain('5406');
  });

  it('สกุลเงินบาท (5303764) และประเทศ TH (5802TH) เสมอ', () => {
    const p = generatePromptPayPayload('0812345678', 9.99);
    expect(p).toContain('5303764');
    expect(p).toContain('5802TH');
  });

  it('ค่าที่ไม่เข้าเงื่อนไข (ไม่ใช่ 10/13/15 หลัก) ต้อง throw', () => {
    expect(() => generatePromptPayPayload('12345')).toThrow();
  });
});
