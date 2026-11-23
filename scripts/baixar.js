'use strict';
// Baixa o instalador OFICIAL mais recente (Release "Latest" do GitHub) e confere se veio íntegro.
// Uso: npm run baixar            -> salva na raiz do projeto
//      npm run baixar -- C:\pasta -> salva na pasta escolhida
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'Wfelipetm/gelo-frio';
const log = m => console.log(m);

async function get(url, opts) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'friogest-baixar', Accept: 'application/vnd.github+json' }, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} em ${url}`);
  return r;
}

(async () => {
  log('Procurando a versão mais recente…');
  const rel = await (await get(`https://api.github.com/repos/${REPO}/releases/latest`)).json();
  const exe = (rel.assets || []).find(a => /\.exe$/i.test(a.name));
  const yml = (rel.assets || []).find(a => a.name === 'latest.yml');
  if (!exe) throw new Error('A Release mais recente não tem o instalador (.exe).');
  const versao = String(rel.tag_name || '').replace(/^v/, '');

  const pasta = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..'); // padrão: raiz do projeto
  fs.mkdirSync(pasta, { recursive: true });
  const destino = path.join(pasta, exe.name);

  log(`Versão ${versao}: baixando ${exe.name} (${(exe.size / 1048576).toFixed(0)} MB)…`);
  const buf = Buffer.from(await (await get(exe.browser_download_url, { headers: { 'User-Agent': 'friogest-baixar' } })).arrayBuffer());

  if (yml) {
    const texto = await (await get(yml.browser_download_url, { headers: { 'User-Agent': 'friogest-baixar' } })).text();
    const esperado = (texto.match(/^sha512:\s*(\S+)/m) || [])[1];
    const obtido = crypto.createHash('sha512').update(buf).digest('base64');
    if (esperado && esperado !== obtido) throw new Error('O arquivo baixado NÃO confere com o latest.yml (corrompido). Não use.');
    log(esperado ? 'Conferido: o arquivo está íntegro.' : 'Aviso: latest.yml sem assinatura para conferir.');
  }
  fs.writeFileSync(destino, buf);
  log(`\nPronto: ${destino}\nFeche o FrioGest e dê duplo clique nesse arquivo para instalar (os dados são mantidos).`);
})().catch(e => { console.error('Falhou: ' + e.message); process.exit(1); });
