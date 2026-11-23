'use strict';
// Demonstração no navegador, sem Electron:  npm run demo
// Sobe o FrioGest com banco temporário + dados de exemplo e abre o navegador já logado. Ctrl+C encerra e apaga tudo.
const fs = require('fs'), os = require('os'), path = require('path'), { exec } = require('child_process');
const { createServer } = require('../server');
const { prepareDemo, seedDemo } = require('../server/demo');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-demo-'));
  const srv = createServer({ dataDir: dir, backupDir: path.join(dir, 'backups'), publicDir: path.join(__dirname, '..', 'public'), version: 'demo', demo: true, readNet: () => ({ lan: false, port: 3300 }), writeNet: () => {} });
  prepareDemo(srv.db);
  const { port } = await srv.listen(+process.env.PORT || 3300, '127.0.0.1');
  process.stdout.write('Preparando dados de exemplo… ');
  await seedDemo(port); console.log('ok');
  const url = `http://127.0.0.1:${port}/`;
  console.log(`\nFrioGest — MODO DEMONSTRAÇÃO em ${url}\n(Ctrl+C para encerrar; os dados de exemplo são descartados.)`);
  if (!process.env.NO_OPEN) exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
  const sair = () => { try { srv.close(); } catch { /* ignora */ } try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignora */ } process.exit(0); };
  process.on('SIGINT', sair); process.on('SIGTERM', sair);
})().catch(e => { console.error(e); process.exit(1); });
