const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createServer } = require('../server');
const { prepareDemo, seedDemo } = require('../server/demo');
const { iniciarAtualizador } = require('./updater');

// Versão de demonstração: arquivo electron/demo.flag (criado por scripts/build-demo.js) ou FRIOGEST_DEMO=1.
// Usa um banco temporário com dados de exemplo e apaga tudo ao fechar — nunca toca em dados reais.
const DEMO = process.env.FRIOGEST_DEMO === '1' || fs.existsSync(path.join(__dirname, 'demo.flag'));

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win, srv, PORT;
const userData = DEMO ? fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-demo-')) : app.getPath('userData');
const cfgFile = path.join(userData, 'config.json');
const readNet = () => { try { const c = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); return { lan: !!c.lan, port: +c.port || 3210 }; } catch { return { lan: false, port: 3210 }; } };
const writeNet = c => fs.writeFileSync(cfgFile, JSON.stringify(c));
const docs = () => path.join(app.getPath('documents'), DEMO ? 'FrioGest Demo' : 'FrioGest');

async function start() {
  fs.mkdirSync(userData, { recursive: true });
  srv = createServer({ dataDir: userData, backupDir: DEMO ? path.join(userData, 'backups') : path.join(docs(), 'Backups'), version: app.getVersion(), publicDir: path.join(__dirname, '..', 'public'), readNet, writeNet: DEMO ? () => {} : writeNet, demo: DEMO });
  if (DEMO) prepareDemo(srv.db);
  const net = DEMO ? { lan: false, port: 3210 } : readNet();
  const { port } = await srv.listen(net.port, net.lan ? '0.0.0.0' : '127.0.0.1');
  PORT = port;
  if (DEMO) await seedDemo(port);
  win = new BrowserWindow({ width: 1366, height: 820, minWidth: 1000, minHeight: 640, title: DEMO ? 'FrioGest — Demonstração' : 'FrioGest', backgroundColor: '#f4f6fa', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL(`http://127.0.0.1:${port}`);
  if (!DEMO) iniciarAtualizador(() => win);

}

ipcMain.handle('openExternal', (_, url) => { if (/^https?:\/\//.test(url)) return shell.openExternal(url); });
ipcMain.handle('restart', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('escolherPasta', async (e, { inicio } = {}) => {
  const r = await dialog.showOpenDialog(win, { title: 'Escolha a pasta da cópia de segurança', properties: ['openDirectory', 'createDirectory'], defaultPath: inicio || undefined });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('printCupom', async (e, { path: p, deviceName }) => {
  // com deviceName imprime em silêncio nessa impressora; sem ele abre a janela de impressão do Windows
  const w = new BrowserWindow({ show: !deviceName, width: 460, height: 760, title: 'Imprimir cupom', autoHideMenuBar: true, webPreferences: { contextIsolation: true } });
  try {
    await w.loadURL(`http://127.0.0.1:${PORT}${p}`);
    await new Promise(r => setTimeout(r, 350));
    return await new Promise(res => w.webContents.print({ silent: !!deviceName, deviceName: deviceName || undefined, printBackground: false, margins: { marginType: 'none' } }, (ok, why) => res({ ok, why })));
  } finally { w.destroy(); }
});
ipcMain.handle('savePdf', async (e, { path: p, filename }) => {
  const port = PORT;
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  try {
    await w.loadURL(`http://127.0.0.1:${port}${p}`);
    await new Promise(r => setTimeout(r, 400));
    const buf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    const dir = path.join(docs(), 'PDFs'); fs.mkdirSync(dir, { recursive: true });
    const safe = String(filename || 'documento.pdf').replace(/[^\w.\- ]/g, '_');
    const file = path.join(dir, safe); fs.writeFileSync(file, buf);
    shell.showItemInFolder(file);
    return { path: file };
  } finally { w.destroy(); }
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(start).catch(err => { dialog.showErrorBox('FrioGest', String(err.stack || err)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { srv?.close(); } catch {} if (DEMO) { try { fs.rmSync(userData, { recursive: true, force: true }); } catch {} } });
