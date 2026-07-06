export const PAPER_SIZE_OPTIONS = [
  { value: 'A4', label: 'A4' },
  { value: 'A5', label: 'A5' },
  { value: 'Letter', label: 'Letter' },
  { value: '9x5.5', label: 'ต่อเนื่อง 9×5.5" (หัวเข็ม)' },
  { value: '9x11', label: 'ต่อเนื่อง 9×11" (LQ-310)' },
  { value: '80mm', label: 'ใบเสร็จย่อ 80mm' },
  { value: '58mm', label: 'ใบเสร็จย่อ 58mm' },
];

export const PAPER_CONFIGS = {
  A4: { page: 'A4', margin: '10mm', font: '13px' },
  A5: { page: 'A5', margin: '8mm', font: '11px' },
  Letter: { page: 'Letter', margin: '10mm', font: '13px' },
  '9x5.5': { page: '9in 5.5in', margin: '5mm', font: '11px' },
  '9x11': { page: '9in 11in', margin: '6mm', font: '12px' },
};

export function getPaperConfig(size) {
  return PAPER_CONFIGS[size] || PAPER_CONFIGS.A4;
}

export function isDotMatrixPaper(size) {
  return size === '9x5.5' || size === '9x11';
}

// Print a full HTML document via a hidden iframe.
// The old approach (window.open + document.write) does not work inside the
// Tauri desktop app — the WebView blocks window.open, so nothing printed.
// An iframe in the same document works in both the browser and the app.
export function printHtml(html) {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0',
    width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  // Give fonts/images a moment to load before opening the print dialog.
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* ignore */ }
    // Clean up long after the dialog is dismissed (no reliable close event).
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 120000);
  }, 700);
}
