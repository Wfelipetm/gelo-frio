// Atualização automática via GitHub Releases (repositório público Wfelipetm/gelo-frio).
// Só roda no app instalado (não em dev nem na demonstração). Sem internet, falha em silêncio.
// O estado é mostrado na interface (faixa no topo + Configurações > Versão do sistema).
const { app, ipcMain } = require('electron');

// estado: indisponivel | ocioso | checando | atual | baixando | pronta | erro
let status = { estado: 'indisponivel', versao: null, percent: 0, erro: null };
let getWin = () => null;
let updater = null;

function set(parcial) {
  status = { ...status, ...parcial };
  const w = getWin();
  if (w && !w.isDestroyed()) w.webContents.send('update:status', status);
}

// Os handlers existem sempre (o preload os expõe); fora do app instalado o estado fica "indisponivel".
ipcMain.handle('update:status', () => status);
ipcMain.handle('update:check', async () => {
  if (!updater) return status;
  if (status.estado === 'checando' || status.estado === 'baixando') return status;
  set({ estado: 'checando', erro: null });
  try {
    const r = await updater.checkForUpdates();
    // sem versão nova: o evento "update-not-available" marca como "atual"
    if (!r || !r.updateInfo) set({ estado: 'atual' });
  } catch (e) { set({ estado: 'erro', erro: 'Não foi possível verificar (sem internet?)' }); }
  return status;
});
ipcMain.handle('update:install', () => { if (updater && status.estado === 'pronta') updater.quitAndInstall(true, true); }); // true,true = instala em silêncio (sem telas) e abre o programa de novo

function iniciarAtualizador(win) {
  getWin = win;
  if (!app.isPackaged) return;
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch { return; }

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true; // se o usuário não reiniciar agora, instala ao fechar o app
  updater.logger = null;
  set({ estado: 'ocioso' });

  // verificações automáticas (a cada minuto) são silenciosas: o menu só muda se achar versão nova
  updater.on('checking-for-update', () => { if (status.estado === 'checando' || status.estado === 'ocioso') set({ estado: 'checando', erro: null }); });
  updater.on('update-available', info => set({ estado: 'baixando', versao: info.version, percent: 0 }));
  updater.on('update-not-available', () => set({ estado: 'atual', versao: null }));
  updater.on('download-progress', p => set({ estado: 'baixando', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', info => set({ estado: 'pronta', versao: info.version, percent: 100 }));
  updater.on('error', () => { if (status.estado === 'checando') set({ estado: 'erro', erro: 'Não foi possível verificar (sem internet?)' }); });

  const checar = () => { if (status.estado !== 'baixando' && status.estado !== 'pronta') updater.checkForUpdates().catch(() => {}); };
  setTimeout(checar, 15000);               // 15 s depois de abrir
  setInterval(checar, 60 * 1000);          // e a cada 1 minuto (só lê o latest.yml, leve): o aviso aparece logo que a versão sai
  app.on('browser-window-focus', checar);  // e sempre que a janela volta ao foco
}

module.exports = { iniciarAtualizador };
