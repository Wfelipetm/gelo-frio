// Atualização automática via GitHub Releases (repositório público Wfelipetm/gelo-frio).
// Só roda no app instalado (não em dev nem na demonstração). Sem internet, falha em silêncio.
const { app, dialog } = require('electron');

function iniciarAtualizador(getWin) {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se o usuário disser "Depois", instala ao fechar o app
  autoUpdater.logger = null;

  autoUpdater.on('update-downloaded', async info => {
    const win = getWin();
    const r = await dialog.showMessageBox(win || undefined, {
      type: 'info',
      title: 'FrioGest — atualização',
      message: `A versão ${info.version} do FrioGest está pronta.`,
      detail: 'Reiniciar agora para atualizar? Seus dados não serão alterados.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0, cancelId: 1,
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => { /* sem internet ou sem release: ignora */ });

  const checar = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(checar, 15000);              // 15 s depois de abrir
  setInterval(checar, 4 * 60 * 60 * 1000); // e a cada 4 horas
}

module.exports = { iniciarAtualizador };
