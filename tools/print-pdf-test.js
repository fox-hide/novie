/* 开发工具：把 HTML 通过 Electron 打印成 PDF，用于验证打印/PDF 导出
   用法：npx electron tools/print-pdf-test.js <html路径> <pdf输出路径>
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const htmlPath = process.argv[2];
const outPath = process.argv[3];

app.whenReady().then(async () => {
  if (!htmlPath || !outPath) {
    console.error('用法: electron tools/print-pdf-test.js <html> <pdf>');
    app.exit(2);
    return;
  }
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.resolve(htmlPath));
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'none' },
    preferCSSPageSize: true,
  });
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), pdf);
  console.log('PDF_OK', path.resolve(outPath), pdf.length);
  app.exit(0);
});
