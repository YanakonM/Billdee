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
