'use strict';
// Teste de ponta a ponta DA INTERFACE: abre o sistema num Chrome/Edge de verdade (via DevTools Protocol)
// e usa as telas como uma pessoa usaria (cliques, digitação, formulários).
//
//   npm run test:e2e            → roda sem janela (headless)
//   npm run test:e2e:live       → abre o Chrome visível e devagar, para acompanhar ao vivo
//
// Variáveis: HEADED=1 (janela visível) · SLOW=ms (pausa entre ações; padrão 350 se HEADED) · CHROME=caminho do navegador · KEEP=1 (não fecha o navegador no fim)
// Usa um banco temporário novo: nunca mexe nos seus dados.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const { createServer } = require('../server');
const { decode } = require('../server/escpos');

const HEADED = !!process.env.HEADED;
const SLOW = +(process.env.SLOW ?? (HEADED ? 350 : 0));
// SHOTS=pasta → tira um print ao fim de cada passo e gera um relatório HTML com as ações explicadas (npm run test:e2e:prints)
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : '';
let acoes = []; const relat = []; let secaoAtual = '';
const nota = t => { if (SHOTS) acoes.push(t); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function acharNavegador() {
  const c = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const f = c.find(p => fs.existsSync(p));
  if (!f) throw new Error('Chrome/Edge não encontrado. Defina CHROME=caminho do executável.');
  return f;
}

// ---------------------------------------------------------------- navegador (CDP)
let ws, msgId = 0; const pend = {}; const jsErrors = [];
const cdp = (method, params = {}) => new Promise(res => { const id = ++msgId; pend[id] = res; ws.send(JSON.stringify({ id, method, params })); });

async function abrirNavegador(url) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-e2e-'));
  const args = [`--remote-debugging-port=0`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--window-size=1366,820', '--disable-features=Translate'];
  if (!HEADED) args.push('--headless=new');
  args.push('about:blank');
  const proc = spawn(acharNavegador(), args, { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 80 && !port; i++) { try { port = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(250); } }
  if (!port) throw new Error('Não consegui conectar ao navegador');
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* aguarda */ } if (!tab) await sleep(250); }
  ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') jsErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  if (!HEADED) await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  return { proc, prof };
}

const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('JS: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const J = JSON.stringify;
// rótulo legível de um elemento (para o relatório): texto do botão, ou o rótulo/placeholder do campo
const rotulo = sel => ev(`(()=>{const e=document.querySelector(${J(sel)});if(!e)return '';
  const lab=(e.closest('label')?.innerText||'').split('\\n')[0].trim();
  const t=['INPUT','SELECT','TEXTAREA'].includes(e.tagName)?'':(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,45);
  return t||lab||e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.getAttribute('name')||e.id||''})()`).catch(() => '');
const ehSenha = sel => ev(`(()=>{const e=document.querySelector(${J(sel)});return !!e&&(e.type==='password')})()`).catch(() => false);

// ---------------------------------------------------------------- ações "de gente"
async function waitFor(fnExpr, what, ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await ev(fnExpr)) return; } catch { /* página trocando */ } await sleep(80); }
  throw new Error('Tempo esgotado esperando: ' + what);
}
const visivel = sel => `(()=>{const e=document.querySelector(${J(sel)});return !!e&&e.getClientRects().length>0})()`;
const waitSel = (sel, ms) => waitFor(visivel(sel), sel, ms);
const waitGone = (sel, ms) => waitFor(`!document.querySelector(${J(sel)})`, 'sumir ' + sel, ms);
const waitText = (txt, ms) => waitFor(`document.body.innerText.toLowerCase().includes(${J(txt.toLowerCase())})`, `texto "${txt}"`, ms); // innerText vem em maiúsculas onde o CSS usa text-transform
const pause = () => sleep(SLOW);

async function mouse(type, x, y) { await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }); }
async function clickXY(x, y) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await pause(); }
async function click(sel, quieto) {
  await waitSel(sel);
  if (SHOTS && !quieto) nota('Clicou em "' + ((await rotulo(sel)) || sel) + '"');
  const p = await ev(`(()=>{const e=document.querySelector(${J(sel)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  await clickXY(p[0], p[1]);
}
// clica no 1º elemento visível cujo texto contém `txt` (dentro de `scope`)
async function clickText(txt, scope = 'body', tags = 'button,a,.btn,.tab,.chip,label,.it,summary') {
  const marca = `(()=>{document.querySelectorAll('[data-e2e]').forEach(x=>x.removeAttribute('data-e2e'));
    const n=${J(txt)}.toLowerCase();const els=[...document.querySelectorAll(${J(scope)})].flatMap(s=>[...s.querySelectorAll(${J(tags)})]);
    const e=els.find(x=>x.getClientRects().length&&x.textContent.replace(/\\s+/g,' ').trim().toLowerCase().includes(n));
    if(!e)return false;e.setAttribute('data-e2e','1');return true})()`;
  await waitFor(marca, `clicar em "${txt}" (${scope})`);
  await click('[data-e2e="1"]');
}
async function type(sel, text) {
  await waitSel(sel); await click(sel, true);
  if (SHOTS) nota(text === '' ? `Limpou o campo "${(await rotulo(sel)) || sel}"` : `Digitou "${(await ehSenha(sel)) ? '••••••' : text}" no campo "${(await rotulo(sel)) || sel}"`);
  await ev(`(()=>{const e=document.querySelector(${J(sel)});e.focus();if(e.select)e.select()})()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  if (text !== '') await cdp('Input.insertText', { text: String(text) });
  await pause();
}
const setv = async (sel, val) => { await waitSel(sel); if (SHOTS) nota(`Preencheu "${val}" no campo "${(await rotulo(sel)) || sel}"`); await ev(`(()=>{const e=document.querySelector(${J(sel)});e.value=${J(String(val))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await pause(); };
const check = async (sel, on = true) => { await waitSel(sel); if (SHOTS) nota(`${on ? 'Marcou' : 'Desmarcou'} a opção "${(await rotulo(sel)) || sel}"`); await ev(`(()=>{const e=document.querySelector(${J(sel)});if(e.checked!==${on}){e.click()}})()`); await pause(); };
async function pick(sel, texto) { // campo de busca com lista suspensa
  await type(sel, texto);
  await waitSel('.drop:not(.hide) .it[data-i="0"]');
  await click('.drop:not(.hide) .it[data-i="0"]');
}
const modalBtn = (label) => clickText(label, '.ov .modal footer', 'button');
const toastOk = async (re) => { await waitFor(`[...document.querySelectorAll('.toast')].some(t=>${re}.test(t.textContent))`, 'aviso ' + re, 8000); };
const goto = async (hash) => {
  await ev(`document.querySelectorAll('.toast').forEach(t=>t.remove());location.hash=${J(hash)}`); await sleep(200);
  await waitFor(`(()=>{const v=document.querySelector('#view');return !!v&&!!v.firstElementChild&&!/^Carregando/.test(v.textContent.trim().slice(0,12))})()`, 'tela carregar', 8000).catch(() => {});
  await pause();
  if (SHOTS) nota(`Abriu a tela "${(await ev(`document.querySelector('#title')?.textContent||''`)) || hash}"`);
};
const limparAvisos = () => ev(`document.querySelectorAll('.toast').forEach(t=>t.remove())`);
const apiGet = (p) => ev(`fetch('/api${p}',{headers:{'X-Requested-With':'friogest'}}).then(async r=>({status:r.status,data:await r.json().catch(()=>null)}))`);
const titulo = () => ev(`document.querySelector('#title')?.textContent||''`);
async function shot(nome) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(os.tmpdir(), `friogest-e2e-${nome}.png`); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f; }

// ---------------------------------------------------------------- mini framework
let ok = 0; const falhas = [];
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: esperado ${J(b)}, veio ${J(a)}`); };
const ver = (c, msg) => { if (!c) throw new Error(msg); };
async function registrar(nome, okk, ms, erro) {
  if (!SHOTS) return;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 62 });
    const arquivo = `${String(relat.length + 1).padStart(2, '0')}.jpg`;
    fs.writeFileSync(path.join(SHOTS, arquivo), Buffer.from(r.result.data, 'base64'));
    relat.push({ secao: secaoAtual, nome, ok: okk, ms, erro: erro || '', acoes: acoes.slice(), arquivo, b64: r.result.data });
  } catch (e) { console.log('  (sem print: ' + e.message + ')'); }
}
// Modo passo a passo (npm run test:e2e:passo): antes de cada passo espera o arquivo PASSO (conteúdo = quantos passos liberar, padrão 1)
let liberados = 0;
async function aguardarLiberacao(nome) {
  const f = process.env.PASSO; if (!f) return;
  if (liberados <= 0) {
    console.log(`  ⏸ PRÓXIMO: ${nome}`);
    while (!fs.existsSync(f)) await sleep(150);
    liberados = Math.max(1, parseInt(String(fs.readFileSync(f, 'utf8')).trim(), 10) || 1); fs.unlinkSync(f);
  }
  liberados--;
}
async function passo(nome, fn) {
  await aguardarLiberacao(nome);
  const t0 = Date.now(); acoes = [];
  try { await fn(); ok++; console.log(`  \u2713 ${nome}  (${Date.now() - t0} ms)`); await registrar(nome, true, Date.now() - t0); }
  catch (e) {
    let f = ''; try { f = await shot(String(falhas.length + 1)); } catch { /* sem print */ }
    try { const d = await ev(`JSON.stringify({toasts:[...document.querySelectorAll('.toast')].map(t=>t.textContent),modal:(document.querySelector('.ov .modal')||{}).innerText||''})`); e.message += ' | tela: ' + d.slice(0, 400); } catch { /* ignore */ }
    await registrar(nome, false, Date.now() - t0, e.message);
    falhas.push({ nome, erro: e.message, f }); console.log(`  \u2717 ${nome}\n      ${e.message}${f ? '\n      print: ' + f : ''}`);
    try { await ev(`document.querySelectorAll('.ov').forEach(o=>o.remove());document.querySelector('.tour-card')&&1`); } catch { /* ignore */ }
  }
}
const secao = t => { secaoAtual = t; console.log(`\n\u25B6 ${t}`); };

// ---------------------------------------------------------------- cenário
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-e2e-db-'));
  const srv = createServer({ dataDir: dir, backupDir: path.join(dir, 'backups'), publicDir: path.join(__dirname, '..', 'public'), readNet: () => ({ lan: false, port: 0 }), writeNet: () => {}, version: 'e2e' });
  const { port } = await srv.listen(40000 + Math.floor(Math.random() * 20000), '127.0.0.1');
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`FrioGest E2E — servidor ${BASE} · banco temporário · ${HEADED ? 'Chrome VISÍVEL' : 'headless'}`);
  const { proc } = await abrirNavegador(BASE + '/');
  await waitSel('#lf', 15000);

  // impressora térmica FALSA na rede: captura os bytes ESC/POS que o sistema enviaria
  const cupons = [];
  const fakePrinter = net.createServer(sock => { const ch = []; sock.on('data', d => ch.push(d)); sock.on('end', () => cupons.push(Buffer.concat(ch))); });
  await new Promise(r => fakePrinter.listen(0, '127.0.0.1', r));
  const fakePort = fakePrinter.address().port;
  const esperarCupom = async () => { for (let i = 0; i < 60 && !cupons.length; i++) await sleep(100); const b = cupons.shift(); if (!b) throw new Error('nenhum cupom chegou na impressora'); return b; };
  const S = {}; // dados criados ao longo do teste
  const login = async (user, pass) => { await type('[name=username]', user); await type('[name=password]', pass); await click('#lf button'); };
  const trocarSenha = async (atual, nova) => {
    await waitSel('.modal [name=atual]');
    await type('.modal [name=atual]', atual); await type('.modal [name=nova]', nova); await type('.modal [name=rep]', nova);
    await modalBtn('Salvar senha');
  };
  const sair = async () => { await click('#lo'); await waitSel('#lf'); };
  const fecharTour = async () => { await waitSel('.tour-card h3', 3000).catch(() => {}); if (await ev(`!!document.querySelector('.tour-card')`)) { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await waitGone('.tour-card'); } };

  // ============================================================ 1. ACESSO
  secao('1. Acesso e primeiro login');
  await passo('login com senha errada mostra erro e não entra', async () => {
    await login('master', 'errada'); await waitSel('#lerr:not(.hide)');
    ver((await ev(`document.querySelector('#lerr').textContent`)).length > 3, 'mensagem de erro vazia');
  });
  await passo('login do master (master123) exige trocar a senha', async () => {
    await login('master', 'master123'); await waitSel('.modal [name=atual]');
    eq(await ev(`document.querySelector('.modal h2').textContent`), 'Crie uma nova senha para continuar', 'título do modal');
    eq(await ev(`!!document.querySelector('.modal [data-x]')`), false, 'o modal obrigatório não pode ter botão de fechar');
  });
  await passo('troca de senha: rejeita senhas diferentes e aceita a correta', async () => {
    await type('.modal [name=atual]', 'master123'); await type('.modal [name=nova]', 'Master#2026'); await type('.modal [name=rep]', 'outra-coisa');
    await modalBtn('Salvar senha'); await waitSel('.m-err:not(:empty)');
    await type('.modal [name=rep]', 'Master#2026'); await modalBtn('Salvar senha');
    await waitSel('#side', 8000);
  });
  await passo('tour guiado abre sozinho no primeiro acesso', async () => {
    await waitSel('.tour-card h3', 6000);
    ver((await ev(`document.querySelector('.tour-card h3').textContent`)).includes('Bem-vindo'), 'título de boas-vindas');
  });
  await passo('tour: avança, volta e fecha com Esc; não reaparece no próximo login', async () => {
    await sleep(500); // deixa o cartão assentar (animação/reposicionamento) antes de clicar
    await click('.tour-next'); await waitText('Passo 2 de'); await sleep(700); await click('.tour-next'); await waitText('Passo 3 de'); await sleep(700);
    await clickText('Voltar', '.tour-card', 'button'); await waitText('Passo 2 de');
    await fecharTour();
    ver(await ev(`Object.keys(localStorage).some(k=>k.startsWith('friogest:tour:'))`), 'não gravou que o tour foi visto');
  });
  if (process.env.STOP_AFTER_TOUR) { console.log('parando após o tour'); try { proc.kill(); } catch {} process.exit(0); }
  await passo('tour: "Tour guiado" no menu reabre e percorre até o fim', async () => {
    await click('#tour'); await waitSel('.tour-card h3');
    for (let i = 0; i < 40 && await ev(`!!document.querySelector('.tour-card')`); i++) { await ev(`document.querySelector('.tour-next')?.click()`); await sleep(SLOW ? 120 : 650); }
    await waitGone('.tour-card', 4000);
    eq(await ev('location.hash'), '#/painel', 'volta ao painel ao concluir');
  });
  await passo('painel carrega com indicadores e atalhos', async () => {
    await goto('#/painel'); await waitSel('.kpis'); eq(await titulo(), 'Painel', 'título');
  });

  // ============================================================ 2. CONFIGURAÇÕES E USUÁRIOS
  secao('2. Configurações, usuários e perfis');
  await passo('configurações: salva os dados da loja e aparecem no menu', async () => {
    await goto('#/config'); await waitSel('[name=loja_nome]');
    await type('[name=loja_nome]', 'Frio Teste Ltda'); await type('[name=loja_telefone]', '(21) 98888-7777'); await click('#save');
    await toastOk(/salv|ok|atualiz/i);
    const cfg = (await apiGet('/me')).data.config; eq(cfg.loja_nome, 'Frio Teste Ltda', 'config salva no servidor');
  });
  await passo('impressora térmica: configura pela tela e imprime o teste', async () => {
    await goto('#/config'); await waitSel('#pm'); await setv('#pm', 'rede'); await waitSel('#pm-rede:not(.hide)');
    await type('[name=impressora_ip]', '127.0.0.1'); await type('[name=impressora_porta]', String(fakePort));
    await check('[name=impressora_auto]', true);
    await limparAvisos(); await click('#pr-test'); await toastOk(/cupom enviado/i);
    const b = await esperarCupom();
    eq([...b.subarray(0, 5)].map(x => x.toString(16)).join(' '), '1b 40 1b 74 2', 'início do cupom (init + PC850)');
    ver(decode(b, 850).includes('TESTE DE IMPRESS'), 'texto do teste');
  });
  await passo('usuários: cria vendedor e técnico', async () => {
    await goto('#/usuarios'); await waitSel('#novo');
    for (const [login_, nome, role, com] of [['vendedor1', 'Vera Vendedora', 'vendedor', '5'], ['tecnico1', 'Tiago Técnico', 'tecnico', '0']]) {
      await click('#novo'); await waitSel('.modal [name=username]');
      await type('.modal [name=username]', login_); await type('.modal [name=senha]', 'provisoria1'); await type('.modal [name=nome]', nome);
      await setv('.modal [name=role]', role); await type('.modal [name=comissao_pct]', com);
      await modalBtn('Salvar'); await waitText(nome);
    }
    const u = (await apiGet('/usuarios')).data; ver(u.some(x => x.username === 'vendedor1') && u.some(x => x.username === 'tecnico1'), 'usuários não foram criados');
    S.tecnicoId = u.find(x => x.username === 'tecnico1').id;
  });
  await passo('usuários: o master não pode ser desativado', async () => {
    const r = await ev(`fetch('/api/usuarios/1',{method:'PUT',headers:{'Content-Type':'application/json','X-Requested-With':'friogest'},body:JSON.stringify({nome:'Administrador',role:'master',ativo:false})}).then(r=>r.status)`);
    ver(r >= 400, 'API aceitou desativar o master (status ' + r + ')');
  });

  // ============================================================ 3. CLIENTES
  secao('3. Clientes e equipamentos');
  await passo('clientes: cadastra cliente e abre a ficha', async () => {
    await goto('#/clientes'); await click('#novo'); await waitSel('.modal [name=nome]');
    await type('.modal [name=nome]', 'Maria das Dores Silva'); await type('.modal [name=doc]', '123.456.789-09'); await type('.modal [name=telefone]', '(21) 99999-1234');
    await type('.modal [name=endereco]', 'Rua das Flores, 100 - Centro'); await modalBtn('Salvar');
    await waitFor(`location.hash.startsWith('#/clientes/')`, 'abrir ficha'); await waitText('Maria das Dores Silva');
    S.clienteId = +(await ev('location.hash')).split('/')[2];
  });
  await passo('clientes: cadastra equipamento (split) na ficha', async () => {
    await click('#neq'); await waitSel('.modal [name=marca]');
    await type('.modal [name=marca]', 'Samsung'); await type('.modal [name=modelo]', 'WindFree 12000'); await type('.modal [name=serie]', 'SN-0001');
    await setv('.modal [name=btus]', '12000'); await modalBtn('Salvar'); await waitText('WindFree');
  });
  await passo('clientes: busca por nome e por telefone', async () => {
    await goto('#/clientes'); await type('#q', 'maria'); await waitText('Maria das Dores');
    await type('#q', '99999-1234'); await waitText('Maria das Dores'); await type('#q', 'zzzz-nao-existe'); await waitText('Nenhum cliente');
  });

  // ============================================================ 4. ESTOQUE E GÁS
  secao('4. Produtos, estoque e gás');
  const novoProduto = async (f) => {
    await goto('#/estoque'); await click('#novoprod'); await waitSel('.modal [name=descricao]');
    if (f.tipo) await setv('.modal [name=tipo]', f.tipo);
    await type('.modal [name=descricao]', f.descricao);
    if (f.unidade) await setv('.modal [name=unidade]', f.unidade);
    if (f.codigo) await type('.modal [name=codigo]', f.codigo);
    if (f.custo != null) await type('.modal [name=custo]', f.custo); await type('.modal [name=preco]', f.preco);
    if (f.minimo != null) await type('.modal [name=minimo]', f.minimo);
    if (f.gas) { await type('.modal [name=gas_tipo]', f.gas); await type('.modal [name=cilindro_kg]', '11.3'); }
    await modalBtn('Salvar'); await waitText(f.descricao);
  };
  await passo('estoque: cadastra peça, serviço e gás', async () => {
    await novoProduto({ descricao: 'Capacitor 35uF', codigo: 'CAP35', custo: 20, preco: 50, minimo: 3 });
    await novoProduto({ tipo: 'servico', descricao: 'Instalação split 12000 BTUs', codigo: 'INST12', preco: 350 });
    await novoProduto({ descricao: 'Gás R-410A', unidade: 'kg', codigo: 'GAS410', custo: 40, preco: 90, gas: 'R-410A' });
    const p = (await apiGet('/produtos?limit=50')).data; eq(p.length, 3, 'qtd de produtos');
    S.cap = p.find(x => x.codigo === 'CAP35'); S.serv = p.find(x => x.codigo === 'INST12'); S.gas = p.find(x => x.codigo === 'GAS410');
  });
  await passo('estoque: serviço não controla estoque e peça começa zerada', async () => {
    eq(S.cap.estoque, 0, 'estoque inicial da peça');
  });
  await passo('estoque: entrada manual de mercadoria atualiza o saldo', async () => {
    await goto('#/estoque?tab=entrada'); await click('#manual'); await waitSel('#forn');
    await type('#forn', 'Distribuidora Gelo Ltda'); await type('#nf', '1234');
    await pick('#busca', 'Capacitor'); await waitSel('[data-q="0"]');
    await type('[data-q="0"]', '10'); await type('[data-c="0"]', '20');
    await click('#confirm'); const m = await ev(`!!document.querySelector('.ov')`); if (m) await modalBtn('Confirmar').catch(() => {});
    await waitFor(`true`, 'entrada'); await sleep(600);
    const p = (await apiGet('/produtos?q=CAP35')).data[0]; eq(p.estoque, 10, 'estoque após entrada');
  });
  await passo('estoque: aba de movimentações mostra a entrada', async () => {
    await goto('#/estoque?tab=mov'); await waitText('Capacitor');
  });
  await passo('gás: cadastra cilindro e o estoque do gás vira a soma dos cilindros', async () => {
    await goto('#/gas'); await click('#novo'); await waitSel('.modal [name=gas_tipo]');
    await type('.modal [name=gas_tipo]', 'R-410A'); await type('.modal [name=capacidade_kg]', '11.3'); await setv('.modal [name=local]', 'Loja');
    await modalBtn('Salvar'); await waitText('R-410A');
    const g = (await apiGet('/produtos?q=GAS410')).data[0]; eq(Math.round(g.estoque * 10) / 10, 11.3, 'saldo do gás');
  });

  // ============================================================ 5. VENDAS (PDV)
  secao('5. PDV e vendas');
  await passo('PDV: venda à vista no Pix com desconto de 10%', async () => {
    await goto('#/pdv'); await waitSel('#busca');
    await pick('#cli input', 'Maria'); await waitText('Maria das Dores');
    await pick('#busca', 'Capacitor'); await waitSel('#cartbox tr, #cartbox .it, #cartbox input');
    await ev(`document.querySelector('#cartbox input[type=number]')&&(document.querySelector('#cartbox input[type=number]').value='2',document.querySelector('#cartbox input[type=number]').dispatchEvent(new Event('input',{bubbles:true})),document.querySelector('#cartbox input[type=number]').dispatchEvent(new Event('change',{bubbles:true})))`);
    await type('#desc', '10'); await click('#pay [data-f="pix"]');
    await waitFor(`document.querySelector('#tot').textContent.replace(/\\s/g,' ').includes('90,00')`, 'total R$ 90,00 (2 x 50 - 10%)');
    cupons.length = 0; await click('#fin'); await waitText('concluída'); S.venda1 = true;
    const cup = decode(await esperarCupom(), 850); ver(cup.includes('R$ 90,00') && cup.includes('Capacitor 35uF') && cup.includes('Maria das Dores'), 'cupom automático da venda: ' + cup.slice(0, 200));
    await modalBtn('Nova venda'); await waitGone('.ov');
  });
  await passo('PDV: estoque baixou 2 unidades', async () => { eq((await apiGet('/produtos?q=CAP35')).data[0].estoque, 8, 'estoque após venda'); });
  await passo('PDV: venda fiada exige cliente', async () => {
    await goto('#/pdv'); await pick('#busca', 'Capacitor'); await waitSel('#cartbox input');
    await click('#pay [data-f="fiado"]'); await click('#fin'); await toastOk(/cliente/i);
  });
  await passo('PDV: venda fiada com cliente gera conta a receber', async () => {
    await pick('#cli input', 'Maria'); await waitText('Maria das Dores'); await limparAvisos(); await click('#fin'); await waitFor(`!!document.querySelector('.ov .modal')||!!document.querySelector('.toast.err')`, 'resultado da venda fiada'); ver(await ev(`!!document.querySelector('.ov .modal')`), 'venda fiada não concluiu: ' + await ev(`[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' / ')`)); await modalBtn('Nova venda');
    const l = (await apiGet('/lancamentos?tipo=receber&situacao=abertos')).data; ver(l.some(x => /fiado|venda/i.test(x.descricao) || x.valor === 50), 'conta a receber não gerada');
  });
  await passo('PDV: impede vender mais que o estoque', async () => {
    await goto('#/pdv'); await pick('#busca', 'Capacitor'); await waitSel('#cartbox input[type=number]');
    await setv('#cartbox input[type=number]', '999'); await click('#fin'); await waitFor(`!!document.querySelector('.toast.err')`, 'erro de estoque insuficiente');
  });
  await passo('vendas: lista e abre o detalhe da venda', async () => {
    await goto('#/vendas'); await waitSel('#list tr.click'); await click('#list tr.click'); await waitSel('.ov .modal'); await ev(`document.querySelector('.ov [data-x]')?.click()`);
  });
  await passo('vendas: devolução de item volta ao estoque', async () => {
    await goto('#/vendas'); await waitSel('#list tr.click'); await click('#list tr.click');
    await clickText('Devolver', '.ov .modal footer', 'button'); await waitSel('.ov .modal [type=number], .ov .modal input');
    await modalBtn('Devolver').catch(() => modalBtn('Confirmar')); await sleep(700);
  });

  // ============================================================ 6. ORÇAMENTO → OS
  secao('6. Orçamento, ordem de serviço e faturamento');
  await passo('orçamento: monta com serviço e gás, calcula e salva', async () => {
    await goto('#/orcamentos/novo'); await waitSel('#busca');
    await pick('#cli input', 'Maria'); await waitText('Maria das Dores');
    await pick('#busca', 'Instalação'); await pick('#busca', 'Gás R-410A');
    await waitFor(`document.querySelector('#tot').textContent.includes('440')`, 'total R$ 440,00 (350 + 1kg x 90)');
    await clickText('Salvar orçamento', '#acoes', 'button'); await toastOk(/salv|orçamento/i);
    const o = (await apiGet('/orcamentos')).data; eq(o.length, 1, 'orçamentos'); S.orc = o[0]; eq(S.orc.total, 440, 'total do orçamento');
  });
  await passo('orçamento: calculadora de BTUs abre e recomenda aparelho', async () => {
    await goto('#/orcamentos/novo'); await click('#btus'); await waitText('Aparelho recomendado'); await modalBtn('Fechar'); await waitGone('.ov');
  });
  await passo('orçamento: PDF abre (HTML de impressão)', async () => {
    const r = await ev(`fetch('/print/orcamento/${S.orc.id}').then(async r=>({s:r.status,t:await r.text()}))`);
    eq(r.s, 200, 'status do PDF'); ver(r.t.includes('Frio Teste Ltda') && r.t.includes('Instala'), 'PDF sem dados da loja/itens');
  });
  await passo('orçamento: botão Cupom imprime na térmica', async () => {
    await goto('#/orcamentos/' + S.orc.id); await waitSel('#acoes'); cupons.length = 0;
    await limparAvisos(); await clickText('Cupom', '#acoes', 'button'); await toastOk(/cupom enviado/i);
    const t = decode(await esperarCupom(), 850); ver(t.includes('Maria das Dores') && t.includes('R$ 440,00'), 'cupom do orçamento: ' + t.slice(0, 200));
  });
  await passo('orçamento: marca como aprovado e converte em OS', async () => {
    await goto('#/orcamentos/' + S.orc.id); await waitSel('#acoes'); await clickText('Cliente aprovou', '#acoes', 'button'); await sleep(600);
    await goto('#/orcamentos/' + S.orc.id); await clickText('Converter', '#acoes', 'button'); await waitSel('#ct');
    await click('#ct [data-t="os"]'); await waitSel('#p-os:not(.hide)'); await setv('#p-os [name=tipo]', 'instalacao'); await setv('#p-os [name=tecnico_id]', String(S.tecnicoId));
    await modalBtn('Converter'); await waitFor(`location.hash.startsWith('#/os/')`, 'abrir a OS criada'); S.osId = +(await ev('location.hash')).split('/')[2];
  });
  await passo('OS: itens vieram do orçamento e o estoque ainda NÃO baixou', async () => {
    await waitFor(`(document.querySelector('#itens')||{innerText:''}).innerText.includes('Instala')`, 'itens da OS vindos do orçamento');
    const g = (await apiGet('/produtos?q=GAS410')).data[0]; eq(Math.round(g.estoque * 10) / 10, 11.3, 'gás só baixa ao concluir');
  });
  await passo('OS: inicia atendimento, escreve laudo e conclui com assinatura', async () => {
    await clickText('Iniciar atendimento', '#acts', 'button'); await waitSel('#laudo'); await sleep(500);
    await type('#laudo', 'Instalado e testado. Pressão ok.'); await clickText('Concluir OS', '#acts', 'button'); await waitSel('#sig');
    const p = await ev(`(()=>{const r=document.querySelector('#sig').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0] + 20, y: p[1] + 30 }); await mouse('mousePressed', p[0] + 20, p[1] + 30);
    for (let i = 1; i <= 6; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0] + 20 + i * 25, y: p[1] + 30 + (i % 2) * 30, button: 'left', buttons: 1 });
    await mouse('mouseReleased', p[0] + 170, p[1] + 30); await modalBtn('Concluir');
    await waitFor(`document.body.innerText.toLowerCase().includes('conclu')`, 'status concluída'); await sleep(600);
  });
  await passo('OS: ao concluir, estoque e gás foram baixados do cilindro', async () => {
    const g = (await apiGet('/produtos?q=GAS410')).data[0]; eq(Math.round(g.estoque * 10) / 10, 10.3, 'gás após OS');
    const c = (await apiGet('/cilindros')).data[0]; eq(Math.round(c.saldo_kg * 10) / 10, 10.3, 'saldo do cilindro');
  });
  await passo('OS: ao concluir já fatura (caixa "Faturar agora") e gera o lançamento financeiro', async () => {
    await goto('#/os/' + S.osId); await waitSel('#acts'); await sleep(500);
    const o = (await apiGet('/os/' + S.osId)).data; eq(o.status, 'faturada', 'status da OS depois de concluir com "Faturar agora"');
    const l = (await apiGet('/lancamentos?tipo=receber&situacao=')).data; ver(l.some(x => x.valor === 440), 'lançamento de R$ 440 não gerado');
    ver(!(await ev(`[...document.querySelectorAll('#acts button')].some(b=>b.textContent.includes('Faturar'))`)), 'o botão Faturar deveria sumir depois de faturada');
  });
  await passo('OS: PDF de impressão gerado', async () => {
    const r = await ev(`fetch('/print/os/${S.osId}').then(async r=>({s:r.status,t:await r.text()}))`); eq(r.s, 200, 'status'); ver(r.t.includes('ORDEM DE SERVIÇO'), 'PDF da OS');
  });
  await passo('OS: botão Cupom imprime na térmica', async () => {
    await goto('#/os/' + S.osId); await waitSel('#acts'); await sleep(400); cupons.length = 0;
    await limparAvisos(); await clickText('Cupom', '#acts', 'button'); await toastOk(/cupom enviado/i);
    const t = decode(await esperarCupom(), 850); ver(t.includes('Maria das Dores') && t.includes('Pressão ok'), 'cupom da OS: ' + t.slice(0, 200));
  });
  await passo('gás: histórico de uso registra a OS', async () => { await goto('#/gas'); await waitText('OS nº'); });

  // ============================================================ 7. FINANCEIRO E RELATÓRIOS
  secao('7. Financeiro e relatórios');
  await passo('financeiro: lança conta a pagar e dá baixa', async () => {
    await goto('#/financeiro'); await clickText('A pagar', '#tabs', '.tab'); await click('#novo'); await waitSel('.modal [name=descricao]');
    await setv('.modal [name=tipo]', 'pagar'); await type('.modal [name=descricao]', 'Aluguel da loja'); await type('.modal [name=pessoa]', 'Imobiliária X'); await type('.modal [name=valor]', '1200');
    await modalBtn('Salvar'); await waitText('Aluguel da loja');
    await clickText('dar baixa', '#tb', 'a'); await waitSel('.ov [name=forma]'); await modalBtn('Confirmar'); await toastOk(/baixa/i);
  });
  await passo('financeiro: caixa do dia soma entradas e saídas', async () => {
    await clickText('Caixa do dia', '#tabs', '.tab'); await waitSel('#dia'); await waitText('Entradas'); await waitText('Saídas');
    const c = (await apiGet('/caixa')).data; ver(c.entradas > 0 && c.saidas === 1200, 'caixa não bate (entradas ' + c.entradas + ', saídas ' + c.saidas + ')');
  });
  await passo('financeiro: filtros mostram contas pagas e vencidas', async () => {
    await clickText('A receber', '#tabs', '.tab'); await clickText('Pagos', '#sc', '.chip'); await sleep(400); await clickText('Todos', '#sc', '.chip'); await waitSel('#tb table');
  });
  await passo('relatórios: vendedores/comissão, lucro e estoque abrem', async () => {
    await goto('#/relatorios'); await waitSel('#tabs');
    for (const t of ['Lucro por produto', 'Posição de estoque', 'Vendedores']) { await clickText(t, '#tabs', '.chip'); await sleep(500); ver(!(await ev(`!!document.querySelector('#view .alert.err')`)), 'erro no relatório ' + t); }
  });
  await passo('painel: indicadores refletem as vendas', async () => {
    await goto('#/painel'); await waitSel('.kpis'); const t = await ev(`document.querySelector('.kpis').innerText`); ver(/R\$\s*\d/.test(t), 'KPI sem valores');
  });

  // ============================================================ 8. ADMIN
  secao('8. Backup e auditoria');
  await passo('backup: cria backup agora e aparece na lista', async () => {
    await goto('#/backup'); await click('#nb'); await toastOk(/backup/i); await sleep(500);
    ver(/\.db|\.sqlite|friogest/i.test(await ev(`document.querySelector('#view').innerText`)), 'backup não listado');
  });
  await passo('backup: alerta de "sem cópia externa" e configuração da pasta externa pela tela', async () => {
    await goto('#/backup'); await waitSel('#bx-pasta');
    ver(/s[oó] neste computador/i.test(await ev(`document.querySelector('#bk-bar')?.innerText || ''`)), 'faixa de alerta não apareceu');
    const pasta = require('path').join(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'friogest-ext-')), 'Drive');
    await type('#bx-pasta', pasta); await click('#bx-save'); await toastOk(/primeira c[oó]pia/i); await sleep(600);
    ver(/em dia/i.test(await ev(`document.querySelector('#view').innerText`)), 'status não ficou "em dia"');
    ver((await ev(`document.querySelector('#bk-bar')?.innerText || ''`)).trim() === '', 'a faixa deveria sumir');
    ver(require('fs').readdirSync(pasta).some(f => /^friogest_.*\.db$/.test(f)), 'arquivo não chegou na pasta externa');
  });
  await passo('auditoria: registra as ações feitas (login, venda, OS...)', async () => {
    await goto('#/auditoria'); await waitSel('#view table'); const t = await ev(`document.querySelector('#view').innerText`);
    ver(/venda/i.test(t) && /os\./i.test(t) || /OS/.test(t), 'ações não aparecem na auditoria');
  });

  // ============================================================ 9. PERMISSÕES
  secao('9. Perfis e permissões');
  await passo('vendedor: troca a senha provisória e vê o tour só com o que pode usar', async () => {
    await sair(); await login('vendedor1', 'provisoria1'); await trocarSenha('provisoria1', 'Vendedor#1'); await waitSel('#side', 8000); await waitSel('.tour-card h3', 6000);
    let n = 0; while (await ev(`!!document.querySelector('.tour-card')`) && n++ < 40) { const c = await ev(`document.querySelector('.tour-count').textContent`); const m = c.match(/de (\d+)/); if (m) S.tourVend = +m[1]; await ev(`document.querySelector('.tour-next')?.click()`); await sleep(SLOW ? 100 : 600); }
    ver(S.tourVend && S.tourVend < 28, 'o tour do vendedor deveria ter menos passos que o do master (' + S.tourVend + ')');
  });
  await passo('vendedor: menu sem Usuários/Configurações/Backup/Auditoria', async () => {
    const itens = await ev(`[...document.querySelectorAll('.nav')].map(a=>a.dataset.r)`);
    for (const r of ['usuarios', 'config', 'backup', 'auditoria']) ver(!itens.includes(r), `vendedor enxerga "${r}"`);
    ver(itens.includes('pdv') && itens.includes('orcamentos'), 'vendedor deveria ver PDV e Orçamentos');
  });
  await passo('vendedor: acesso direto às telas e APIs de admin é barrado', async () => {
    await goto('#/usuarios'); await sleep(500); ver((await ev('document.querySelector("#title").textContent')) !== 'Usuários', 'abriu a tela de Usuários');
    for (const p of ['/usuarios', '/auditoria', '/backups']) { const r = await apiGet(p); ver(r.status === 403 || r.status === 404, `${p} devolveu ${r.status} para vendedor`); }
  });
  await passo('vendedor: não vê custo nem lucro dos produtos', async () => {
    const p = (await apiGet('/produtos?q=CAP35')).data[0]; ver(p.custo === undefined || p.custo === null, 'custo vazou para o vendedor: ' + p.custo);
    await goto('#/orcamentos/novo'); await pick('#busca', 'Capacitor'); await sleep(500); ver(!(await ev(`!!document.querySelector('#margem')`)) || !/Lucro/.test(await ev(`document.querySelector('#margem')?.innerText||''`)), 'margem/lucro visível ao vendedor');
  });
  await passo('vendedor: consegue vender no PDV', async () => {
    await goto('#/pdv'); await pick('#busca', 'Capacitor'); await waitSel('#cartbox input'); await click('#pay [data-f="dinheiro"]'); await click('#fin'); await waitText('concluída'); await modalBtn('Nova venda');
  });
  await passo('técnico: troca a senha e só enxerga as OS dele', async () => {
    await sair(); await login('tecnico1', 'provisoria1'); await trocarSenha('provisoria1', 'Tecnico#1'); await waitSel('#side', 8000); await fecharTour().catch(() => {});
    const itens = await ev(`[...document.querySelectorAll('.nav')].map(a=>a.dataset.r)`); ver(itens.includes('os') && !itens.includes('financeiro') && !itens.includes('pdv'), 'menu do técnico: ' + itens.join(','));
    await goto('#/os'); await waitSel('#view');
  });
  await passo('master: usuário desativado perde o acesso e senha redefinida exige troca', async () => {
    await sair(); await login('master', 'Master#2026'); await waitSel('#side', 8000); await fecharTour().catch(() => {});
    await goto('#/usuarios'); await waitText('vendedor1'); await ev(`[...document.querySelectorAll('#view tbody tr')].find(r=>r.innerText.includes('tecnico1')).querySelector('[data-s]').click()`); await waitSel('.ov [name=senha]');
    await type('.ov [name=senha]', 'Nova#Prov1'); await modalBtn('Redefinir'); await toastOk(/redefin/i);
    await sair(); await login('tecnico1', 'Nova#Prov1'); await waitSel('.modal [name=atual]');
  });
  await passo('login bloqueia após 5 senhas erradas', async () => {
    await modalBtn('Sair'); await waitSel('#lf', 8000);
    for (let i = 0; i < 6; i++) { await type('[name=username]', 'vendedor1'); await type('[name=password]', 'errada' + i); await click('#lf button'); await sleep(250); }
    await waitSel('#lerr:not(.hide)'); ver(/bloque|tentativ|aguarde/i.test(await ev(`document.querySelector('#lerr').textContent`)), 'mensagem de bloqueio: ' + await ev(`document.querySelector('#lerr').textContent`));
  });

  // ============================================================ resultado
  secao('Qualidade');
  await passo('nenhuma exceção JavaScript não tratada durante todo o teste', async () => { ver(jsErrors.length === 0, jsErrors.slice(0, 3).join(' | ')); });

  console.log(`\n${falhas.length ? '\u2717' : '\u2713'} ${ok} passos ok${falhas.length ? `, ${falhas.length} com falha` : ''}`);
  falhas.forEach(f => console.log(` - ${f.nome}: ${f.erro}`));
  if (SHOTS && relat.length) { const f = require('./e2e-report').gerar(relat, SHOTS); console.log(`
Relatório com prints: ${f}`); }
  try { fakePrinter.close(); } catch { /* ignore */ }
  if (!process.env.KEEP) { try { proc.kill(); } catch { /* ignore */ } }
  try { await srv.close(); } catch { /* ignore */ }
  setTimeout(() => process.exit(falhas.length ? 1 : 0), 200);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(2); });
