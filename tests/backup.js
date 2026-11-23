'use strict';
// Testes do backup com cópia externa (pasta no pendrive/Drive) e do alerta de atraso. Roda com: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server');

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 5).join('\n    ')); process.exitCode = 1; }
};

(async () => {
  console.log('Backup com cópia externa');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-bk-'));
  const externa = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-drive-')), 'FrioGest-Backup'); // "outro disco": fora da pasta do banco
  const srv = createServer({ dataDir: dir, backupDir: path.join(dir, 'backups'), publicDir: path.join(__dirname, '..', 'public'), readNet: () => ({ lan: false, port: 0 }), writeNet: () => {}, version: 'test' });
  const { port } = await srv.listen(40000 + Math.floor(Math.random() * 20000), '127.0.0.1');
  const client = () => {
    let ck = '';
    return async (m, u, b) => {
      const r = await fetch(`http://127.0.0.1:${port}/api${u}`, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'friogest', Cookie: ck }, body: b === undefined ? undefined : JSON.stringify(b) });
      const s = r.headers.get('set-cookie'); if (s) ck = s.split(';')[0];
      return { status: r.status, data: await r.json().catch(() => null) };
    };
  };
  const adm = client();
  await adm('POST', '/login', { username: 'master', password: 'master123' });
  await adm('POST', '/me/senha', { atual: 'master123', nova: 'Master#1234' });
  const arquivos = d => fs.readdirSync(d).filter(f => /^friogest_.*\.db$/.test(f));

  await t('começa sem cópia externa (nível "desligado")', async () => {
    const r = await adm('GET', '/backups/status');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.nivel, 'desligado'); assert.strictEqual(r.data.pasta, '');
  });
  await t('recusa caminho relativo, a pasta de backups e a pasta do banco', async () => {
    assert.strictEqual((await adm('PUT', '/backups/externo', { pasta: 'meus-backups' })).status, 400);
    assert.strictEqual((await adm('PUT', '/backups/externo', { pasta: path.join(dir, 'backups') })).status, 400);
    assert.strictEqual((await adm('PUT', '/backups/externo', { pasta: path.join(dir, 'outra') })).status, 400);
  });
  await t('pasta válida: salva, testa a gravação e já faz a primeira cópia', async () => {
    const r = await adm('PUT', '/backups/externo', { pasta: externa });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.strictEqual(r.data.status.nivel, 'ok'); assert.ok(r.data.status.ultimo); assert.strictEqual(r.data.copia.externo.ok, true);
    assert.strictEqual(arquivos(externa).length, 1);
    assert.ok(!fs.readdirSync(externa).some(f => f.endsWith('.parcial') || f.startsWith('.friogest-teste')), 'sobrou arquivo temporário');
  });
  await t('a cópia externa é um banco SQLite íntegro, igual ao backup local', async () => {
    const f = arquivos(externa)[0];
    assert.ok(fs.readFileSync(path.join(externa, f)).subarray(0, 15).toString() === 'SQLite format 3', 'não é um SQLite');
    assert.strictEqual(fs.statSync(path.join(externa, f)).size, fs.statSync(path.join(dir, 'backups', f)).size);
  });
  await t('cada backup novo também vai para a pasta externa', async () => {
    await new Promise(r => setTimeout(r, 1100)); // nome do arquivo tem segundos
    const r = await adm('POST', '/backups');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.externo.ok, true);
    assert.ok(arquivos(externa).includes(r.data.arquivo));
  });
  await t('mantém só os 30 mais recentes na pasta externa', async () => {
    for (let i = 0; i < 35; i++) fs.writeFileSync(path.join(externa, `friogest_2020-01-01_0000${String(i).padStart(2, '0')}.db`), 'x');
    await new Promise(r => setTimeout(r, 1100));
    assert.strictEqual((await adm('POST', '/backups')).status, 200);
    const f = arquivos(externa); assert.strictEqual(f.length, 30, 'ficaram ' + f.length);
    assert.ok(!f.some(x => x.startsWith('friogest_2020-01-01_000000')), 'o mais antigo deveria ter sido apagado');
  });
  await t('pasta indisponível: o backup local continua e o erro é registrado', async () => {
    fs.rmSync(externa, { recursive: true, force: true }); fs.writeFileSync(externa, 'agora sou um arquivo'); // destino quebrado
    await new Promise(r => setTimeout(r, 1100));
    const r = await adm('POST', '/backups');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.externo.ok, false); assert.ok(r.data.externo.erro);
    assert.ok(arquivos(path.join(dir, 'backups')).includes(r.data.arquivo), 'o backup local deveria existir');
    assert.ok((await adm('GET', '/backups/status')).data.erro, 'o erro deveria aparecer no status');
    fs.rmSync(externa, { force: true });
  });
  await t('sem cópia externa há mais de 2 dias => nível "atrasado"', async () => {
    assert.strictEqual((await adm('PUT', '/backups/externo', { pasta: externa })).status, 200);
    srv.db.prepare("UPDATE settings SET value=? WHERE key='backup_externo_ultimo'").run(new Date(Date.now() - 3 * 86400000).toISOString());
    const s = (await adm('GET', '/backups/status')).data;
    assert.strictEqual(s.nivel, 'atrasado'); assert.strictEqual(s.dias, 3);
    srv.db.prepare("UPDATE settings SET value=? WHERE key='backup_externo_ultimo'").run(new Date(Date.now() - 3600000).toISOString());
    assert.strictEqual((await adm('GET', '/backups/status')).data.nivel, 'ok');
  });
  await t('quem não tem permissão de backup não vê o status', async () => {
    await adm('POST', '/usuarios', { username: 'vend1', nome: 'Vendedor', role: 'vendedor', senha: 'teste123' });
    const v = client();
    await v('POST', '/login', { username: 'vend1', password: 'teste123' });
    await v('POST', '/me/senha', { atual: 'teste123', nova: 'Vendedor#123' });
    assert.strictEqual((await v('GET', '/backups/status')).status, 403);
    assert.strictEqual((await v('PUT', '/backups/externo', { pasta: externa })).status, 403);
  });
  await t('desligar: texto vazio volta ao nível "desligado" e o backup local segue', async () => {
    const r = await adm('PUT', '/backups/externo', { pasta: '' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.status.nivel, 'desligado');
    assert.strictEqual((await adm('POST', '/backups')).data.externo.desligado, true);
  });

  srv.close();
  console.log(`\n${passed} testes de backup ok`);
  process.exit(process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
