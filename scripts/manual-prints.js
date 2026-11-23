'use strict';
// Tira os prints do MANUAL DO USUÁRIO: sobe o sistema com dados de exemplo num banco temporário, abre num Chrome (headless)
// e fotografa cada tela, marcando as partes importantes com números (1, 2, 3…) que o manual explica.
//   node scripts/manual-prints.js            → grava em manual/img/*.jpg e manual/prints.json
// Nunca toca em dados reais.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createServer } = require('../server');
const { prepareDemo, seedDemo, DEMO_USER, DEMO_PASS } = require('../server/demo');

const OUT = path.join(__dirname, '..', 'manual', 'img');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// versão que aparece no menu dos prints: a da última Release (se não der para consultar, 1.0.0)
const versaoAtual = async () => { try { const r = await (await fetch('https://api.github.com/repos/Wfelipetm/gelo-frio/releases/latest', { headers: { 'User-Agent': 'friogest-manual' } })).json(); return String(r.tag_name || '').replace(/^v/, '') || '1.0.0'; } catch { return '1.0.0'; } };
const J = JSON.stringify;

function navegador() {
  const c = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
  const f = c.find(p => fs.existsSync(p)); if (!f) throw new Error('Chrome/Edge não encontrado (defina CHROME)'); return f;
}

let ws, msgId = 0; const pend = {};
const cdp = (method, params = {}) => new Promise(res => { const id = ++msgId; pend[id] = res; ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error('JS: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
const visivel = sel => `(()=>{const e=document.querySelector(${J(sel)});return !!e&&e.getClientRects().length>0})()`;
async function waitFor(expr, what, ms = 9000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return; } catch { /* trocando de página */ } await sleep(80); } throw new Error('Tempo esgotado: ' + what); }
const waitSel = (sel, ms) => waitFor(visivel(sel), sel, ms);
async function click(sel) {
  await waitSel(sel);
  const p = await ev(`(()=>{const e=document.querySelector(${J(sel)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await sleep(250);
}
async function type(sel, text) {
  await click(sel);
  await ev(`(()=>{const e=document.querySelector(${J(sel)});e.focus();if(e.select)e.select()})()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  if (text) await cdp('Input.insertText', { text: String(text) });
  await sleep(200);
}
async function pick(sel, texto) { await type(sel, texto); await waitSel('.drop:not(.hide) .it[data-i="0"]'); await click('.drop:not(.hide) .it[data-i="0"]'); await sleep(250); }
async function ir(hash) {
  await ev(`document.querySelectorAll('.toast,.ov').forEach(t=>t.remove());location.hash=${J(hash)}`); await sleep(250);
  await waitFor(`(()=>{const v=document.querySelector('#view');return !!v&&!!v.firstElementChild&&!/^Carregando/.test(v.textContent.trim().slice(0,12))})()`, 'tela', 8000).catch(() => {});
  await sleep(500);
}
const fechar = () => ev(`document.querySelectorAll('.ov').forEach(o=>o.remove());document.querySelectorAll('.tour-card,.tour-spot,.tour-back').forEach(o=>o.remove())`);

// números vermelhos sobre as partes da tela
const MARCAR = `(lista)=>{
  document.querySelectorAll('.mk-man').forEach(x=>x.remove());
  const feitos=[];
  for (const [sel,n] of lista){
    const e=document.querySelector(sel); if(!e||!e.getClientRects().length) continue;
    const rr=e.getBoundingClientRect(); if(rr.bottom<0||rr.top>innerHeight) continue; feitos.push(n);
    const r=e.getBoundingClientRect();
    const box=document.createElement('div');box.className='mk-man';
    box.style.cssText='position:fixed;z-index:99998;pointer-events:none;border:2.5px solid #e11d48;border-radius:9px;left:'+(r.left-4)+'px;top:'+(r.top-4)+'px;width:'+(r.width+8)+'px;height:'+(r.height+8)+'px';
    const b=document.createElement('div');b.className='mk-man';
    b.style.cssText='position:fixed;z-index:99999;pointer-events:none;background:#e11d48;color:#fff;font:700 14px/26px system-ui,sans-serif;width:26px;height:26px;text-align:center;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35);left:'+Math.max(2,r.left-16)+'px;top:'+Math.max(2,r.top-16)+'px';
    b.textContent=n; document.body.append(box,b);
  }
  return feitos;}`;

// troca os caminhos temporários do banco de teste por caminhos de exemplo realistas (só na imagem)
const LIMPAR = String.raw`(()=>{
  const fix=t=>t.replace(/[A-Za-z]:\\[^\s<"]*friogest-manual-[A-Za-z0-9]+(\\backups)?/g,(m,b)=>b?'C:\\Users\\Loja\\Documents\\FrioGest\\Backups':'C:\\Users\\Loja\\AppData\\Roaming\\FrioGest').replace(/[A-Za-z]:\\[^\s<"]*friogest-ext-[A-Za-z0-9]+\\Meu Drive\\FrioGest-Backup/g,'G:\\Meu Drive\\FrioGest-Backup');
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const v=fix(n.nodeValue);if(v!==n.nodeValue)n.nodeValue=v}
  document.querySelectorAll('input').forEach(i=>{const v=fix(i.value||'');if(v!==i.value)i.value=v});
})()`;
const prints = [];
async function foto(arquivo, titulo, marcas = [], rolar = '') {
  if (rolar) { await ev(`document.querySelector(${J(rolar)})?.scrollIntoView({block:'center'})`); await sleep(350); }
  await ev(LIMPAR);
  let feitas = [];
  if (marcas.length) feitas = await ev(`(${MARCAR})(${J(marcas)})`); else await ev(`document.querySelectorAll('.mk-man').forEach(x=>x.remove())`);
  await sleep(150);
  const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  fs.writeFileSync(path.join(OUT, arquivo + '.jpg'), Buffer.from(r.result.data, 'base64'));
  prints.push({ arquivo, titulo, marcas: feitas });
  console.log('  ✓ ' + arquivo);
  await ev(`document.querySelectorAll('.mk-man').forEach(x=>x.remove())`);
}
const tentar = async (nome, fn) => { try { await fn(); } catch (e) { console.log(`  ✗ ${nome}: ${e.message}`); } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-manual-'));
  const srv = createServer({ dataDir: dir, backupDir: path.join(dir, 'backups'), publicDir: path.join(__dirname, '..', 'public'), readNet: () => ({ lan: false, port: 0 }), writeNet: () => {}, version: await versaoAtual() });
  prepareDemo(srv.db);
  const { port } = await srv.listen(40000 + Math.floor(Math.random() * 20000), '127.0.0.1');
  await seedDemo(port);
  // a loja do manual não deve parecer "demonstração": só o banco veio de exemplo
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-manual-chrome-'));
  const proc = spawn(navegador(), ['--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--headless=new', '--window-size=1366,820', '--disable-features=Translate', 'about:blank'], { stdio: 'ignore' });
  let dp; for (let i = 0; i < 80 && !dp; i++) { try { dp = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(250); } }
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${dp}/json`)).json()).find(t => t.type === 'page'); } catch { /* aguarda */ } if (!tab) await sleep(250); }
  ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/?simular-update=atual` }); // o menu mostra "Atualizado" nos prints
  await waitSel('#lf', 15000);

  // ---------------- login
  await tentar('login', async () => { await foto('01-login', 'Tela de entrada', [['[name=username]', 1], ['[name=password]', 2], ['#lf button', 3]]); });
  await type('[name=username]', DEMO_USER); await type('[name=password]', DEMO_PASS); await click('#lf button');
  await waitSel('#view'); await sleep(900);
  await sleep(1300); // o tour abre sozinho no primeiro acesso: fecha com Esc para não aparecer nos prints
  if (await ev(`!!document.querySelector('.tour-card')`)) { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(500); }

  // ---------------- backup: primeiro SEM cópia externa (mostra a faixa de aviso); depois configura para as outras telas ficarem limpas
  await tentar('backup sem cópia externa', async () => { await ir('#/backup'); await foto('22-backup-aviso', 'Backup sem cópia externa: o sistema avisa', [['#bk-bar', 1], ['#bx-pasta', 2], ['#bx-save', 3], ['#nb', 4]]); });
  const ext = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-ext-')), 'Meu Drive', 'FrioGest-Backup');
  await ev(`fetch('/api/backups/externo',{method:'PUT',headers:{'Content-Type':'application/json','X-Requested-With':'friogest'},body:JSON.stringify({pasta:${J(ext)}})}).then(r=>r.json())`);
  await ev(`window.dispatchEvent(new Event('friogest:backup'))`); await sleep(500);
  // ---------------- painel
  await tentar('painel', async () => { await ir('#/painel'); await fechar(); await foto('02-painel', 'Painel', [['.side .nav[data-r="pdv"]', 1], ['#view .kpi', 2], ['#actions .btn.p', 3], ['.user', 4]]); });
  // ---------------- PDV
  await tentar('pdv vazio', async () => { await ir('#/pdv'); await foto('03-pdv', 'Nova venda (PDV)', [['#cli', 1], ['#busca', 2], ['#cartbox', 3], ['#pay', 4], ['#fin', 5]]); });
  await tentar('pdv carrinho', async () => {
    await pick('#busca', 'filtro'); await pick('#busca', 'limpeza');
    await type('#desc', '5'); await click('#pay [data-f="pix"]');
    await foto('04-pdv-carrinho', 'Venda montada com itens, desconto e forma de pagamento', [['#cartbox', 1], ['#desc', 2], ['#pay', 3], ['#tot', 4], ['#fin', 5]]);
  });
  await tentar('vendas', async () => { await ir('#/vendas'); await foto('05-vendas', 'Lista de vendas', [['#q', 1], ['#de', 2], ['#list', 3], ['#actions .btn.p', 4]]); });
  await tentar('venda detalhe', async () => { await click('#list tbody tr'); await waitSel('.ov .modal').catch(() => {}); await sleep(400); await foto('06-venda-detalhe', 'Detalhe da venda (devolução e cancelamento)', []); await fechar(); });
  // ---------------- orçamentos
  await tentar('orçamentos', async () => { await ir('#/orcamentos'); await foto('07-orcamentos', 'Lista de orçamentos', [['#q', 1], ['#list', 2], ['#actions .btn.p', 3]]); });
  await tentar('orçamento', async () => { await ir('#/orcamentos/1'); await foto('08-orcamento', 'Orçamento aberto', [['#cli', 1], ['#busca', 2], ['#itens', 3], ['#tot', 4], ['#acoes', 5], ['#btus', 6]]); });
  // ---------------- OS
  await tentar('os lista', async () => { await ir('#/os'); await foto('09-os-lista', 'Ordens de serviço', [['#q', 1], ['#list', 2], ['#actions .btn.p', 3]]); });
  await tentar('os detalhe', async () => { await ir('#/os/1'); await foto('10-os', 'Ordem de serviço aberta', [['#cli', 1], ['#tec', 2], ['#itens', 3]]); await foto('10b-os-laudo', 'Laudo técnico e assinatura do cliente', [['#laudo', 1], ['#sig', 2]], '#laudo'); });
  // ---------------- estoque e gás
  await tentar('estoque', async () => { await ir('#/estoque'); await foto('11-estoque', 'Estoque', [['#tabs', 1], ['#q', 2], ['#list', 3], ['#novoprod', 4]]); });
  await tentar('estoque novo produto', async () => { await click('#novoprod'); await waitSel('.ov .modal'); await sleep(300); await foto('12-produto-novo', 'Cadastro de produto', []); await fechar(); });
  await tentar('estoque entrada', async () => {
    await ir('#/estoque');
    const ok = await ev(`(()=>{const t=[...document.querySelectorAll('#tabs .tab')].find(x=>/entrada/i.test(x.textContent));if(!t)return false;t.click();return true})()`);
    if (ok) { await sleep(700); await foto('13-estoque-entrada', 'Entrada de mercadoria (manual ou XML da NF-e)', [['#tabs', 1], ['#xml', 2], ['#forn', 3]]); }
  });
  await tentar('gás', async () => { await ir('#/gas'); await foto('14-gas', 'Gás refrigerante por cilindro', [['#actions .btn.p', 1], ['#view table', 2]]); });
  // ---------------- clientes
  await tentar('clientes', async () => { await ir('#/clientes'); await foto('15-clientes', 'Clientes', [['#q', 1], ['#list', 2], ['#novo', 3]]); });
  await tentar('cliente ficha', async () => { await ir('#/clientes/1'); await foto('16-cliente-ficha', 'Ficha do cliente com equipamentos e histórico', [['#neq', 1], ['#wa', 2], ['#ed', 3]]); });
  // ---------------- financeiro e relatórios
  await tentar('financeiro', async () => { await ir('#/financeiro'); await foto('17-financeiro', 'Financeiro: a receber, a pagar e caixa', [['#tabs', 1], ['#novo', 2], ['#view table', 3]]); });
  await tentar('relatórios', async () => { await ir('#/relatorios'); await foto('18-relatorios', 'Relatórios', [['#tabs', 1], ['#de', 2], ['#exp', 3]]); });
  // ---------------- administração
  await tentar('usuários', async () => { await ir('#/usuarios'); await foto('19-usuarios', 'Usuários e perfis', [['#novo', 1], ['#view table', 2]]); });
  await tentar('configurações', async () => { await ir('#/config'); await foto('20-config', 'Configurações da loja', [['[name=loja_nome]', 1], ['[name=margem_padrao]', 2], ['[name=msg_orcamento]', 3]]); await foto('21-config-impressora', 'Configurações: impressora térmica', [['#pm', 1], ['#pr-save', 2], ['#pr-test', 3]], '#pm'); });
  await tentar('backup em dia', async () => { await ir('#/backup'); await foto('22b-backup-em-dia', 'Backup com a cópia externa em dia', [['.bk-st', 1], ['#bx-pasta', 2], ['#view table', 3]]); });
  await tentar('auditoria', async () => { await ir('#/auditoria'); await foto('23-auditoria', 'Auditoria', [['#view table', 1]]); });
  // ---------------- tour
  await tentar('tour', async () => { await ir('#/painel'); await click('#tour'); await waitSel('.tour-card').catch(() => {}); await sleep(600); await foto('24-tour', 'Tour guiado', []); await fechar(); });

  fs.writeFileSync(path.join(__dirname, '..', 'manual', 'prints.json'), JSON.stringify(prints, null, 1));
  console.log(`\n${prints.length} prints em ${OUT}`);
  try { proc.kill(); } catch { /* ignora */ }
  try { srv.close(); } catch { /* ignora */ }
  setTimeout(() => process.exit(0), 200);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(2); });
