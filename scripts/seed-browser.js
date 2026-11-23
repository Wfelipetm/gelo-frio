'use strict';
// Abre o Chrome no sistema; VOCÊ faz o login (a senha nunca passa pelo script) e, assim que a sessão abrir,
// roda o seed (scripts/seed.js) reaproveitando o cookie dessa sessão. Depois deixa o Chrome aberto no Painel.
//   npm run seed:browser        (sistema precisa estar rodando: npm run dev)
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const BASE = (process.env.SEED_URL || 'http://127.0.0.1:3210').replace(/\/$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(p => fs.existsSync(p));
if (!chrome) { console.error('Chrome/Edge não encontrado (defina CHROME=caminho).'); process.exit(1); }

(async () => {
  try { await fetch(BASE + '/api/info'); } catch { console.error(`Sistema fora do ar em ${BASE}. Rode "npm run dev" antes.`); process.exit(1); }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-seed-'));
  spawn(chrome, ['--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', BASE + '/'], { stdio: 'ignore', detached: true }).unref();
  let port; for (let i = 0; i < 80 && !port; i++) { try { port = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(250); } }
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* aguarda */ } if (!tab) await sleep(250); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Network.enable');

  console.log('➜ Faça o login na janela do Chrome que abriu (se pedir, troque a senha provisória). Aguardando…');
  let logado = false;
  for (let i = 0; i < 600 && !logado; i++) { // até 10 min
    await sleep(1000);
    const r = await ev(`fetch('/api/me',{headers:{'X-Requested-With':'friogest'}}).then(async r=>r.ok?(await r.json()).user:null).catch(()=>null)`);
    logado = !!(r && !r.must_change);
  }
  if (!logado) { console.error('Tempo esgotado sem login.'); process.exit(1); }
  const { result } = await send('Network.getCookies', { urls: [BASE] });
  const sid = (result.cookies || []).find(c => c.name === 'sid');
  if (!sid) { console.error('Não encontrei o cookie de sessão.'); process.exit(1); }
  console.log('✓ Login detectado. Criando os dados de teste…\n');
  await new Promise(res => { const p = spawn('node', [path.join(__dirname, 'seed.js')], { stdio: 'inherit', env: { ...process.env, SEED_URL: BASE, SEED_COOKIE: `sid=${sid.value}` } }); p.on('close', code => { process.exitCode = code; res(); }); });
  await ev(`location.hash='#/painel'; location.reload()`);
  console.log('\nO Chrome continua aberto no Painel — é só usar.');
  process.exit(process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
