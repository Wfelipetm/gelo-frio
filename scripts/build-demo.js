'use strict';
// Gera o executável de DEMONSTRAÇÃO para mandar ao cliente:  npm run dist:demo
// → dist-demo/FrioGest-Demo-<versão>.exe  (portátil: um único arquivo, abre com duplo clique, sem instalar).
// Ele sobe o sistema com banco temporário + dados de exemplo, entra sozinho e apaga tudo ao fechar.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const flag = path.join(root, 'electron', 'demo.flag');
const cli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
fs.writeFileSync(flag, 'demo\n');
let code = 1;
try {
  const r = spawnSync(process.execPath, [cli, '--win', 'portable', '--x64',
    '--config.productName=FrioGest Demo', '--config.appId=br.com.friogest.demo', '--config.directories.output=dist-demo',
    '--config.artifactName=FrioGest-Demo-${version}.${ext}', '--config.copyright=FrioGest', '--config.win.signAndEditExecutable=false'],
  { cwd: root, stdio: 'inherit' });
  code = r.status ?? 1;
} finally { try { fs.unlinkSync(flag); } catch { /* ignora */ } }
if (code === 0) console.log('\n✓ Pronto em dist-demo/ — mande o .exe para o cliente.');
process.exit(code);
