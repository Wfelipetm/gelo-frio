import { icon, $, $$, esc, api, state, toast, fail, modal, getForm, fld, isElectron, ROLES } from './core.js';
import { iniciarTour, tourVisto } from './tour.js';

// Barra de título azul (só no programa instalado). Para ver no navegador: abra com ?simular-titlebar
if (window.friogest?.titleBar || new URLSearchParams(location.search).has('simular-titlebar')) {
  document.documentElement.classList.add('tb');
  const tb = $('#titlebar'), tit = document.querySelector('title');
  const pintar = () => { tb.innerHTML = `${icon('snowflake', 15)}<span>${esc(document.title)}</span>`; };
  pintar();
  new MutationObserver(pintar).observe(tit, { childList: true });
}

const NAV = [
  { r: 'painel', t: 'Painel', i: 'layout-dashboard', mod: 'painel' },
  { r: 'pdv', t: 'Nova venda', i: 'shopping-cart', perm: 'venda.criar', mod: 'pdv' },
  { r: 'vendas', t: 'Vendas', i: 'receipt', perm: 'venda.criar', mod: 'vendas' },
  { r: 'orcamentos', t: 'Orçamentos', i: 'file-text', perm: 'orc.gerir', mod: 'orcamentos' },
  { r: 'os', t: 'Ordens de serviço', i: 'wrench', perm: 'os.ver', mod: 'os' },
  { r: 'estoque', t: 'Estoque', i: 'package', perm: 'estoque.ver', mod: 'estoque' },
  { r: 'gas', t: 'Gás refrigerante', i: 'flask-conical', perm: 'gas.ver', mod: 'gas' },
  { r: 'clientes', t: 'Clientes', i: 'users', perm: 'cliente.ver', mod: 'clientes' },
  { r: 'financeiro', t: 'Financeiro', i: 'circle-dollar-sign', perm: 'fin.ver', mod: 'financeiro' },
  { r: 'relatorios', t: 'Relatórios', i: 'chart-column', perm: 'rel.ver', mod: 'relatorios' },
  { grp: 'Administração', perm: 'usuarios|config|backup|auditoria' },
  { r: 'usuarios', t: 'Usuários', i: 'key-round', perm: 'usuarios', mod: 'admin', fn: 'usuarios' },
  { r: 'config', t: 'Configurações', i: 'settings', perm: 'config', mod: 'admin', fn: 'config' },
  { r: 'backup', t: 'Backup', i: 'save', perm: 'backup', mod: 'admin', fn: 'backup' },
  { r: 'auditoria', t: 'Auditoria', i: 'eye', perm: 'auditoria', mod: 'admin', fn: 'auditoria' },
];
const allowed = n => !n.perm || n.perm.split('|').some(p => state.can(p));
const root = $('#root');
let current = null;

async function boot() {
  try {
    const me = await api('/me');
    try { state.demo = !!(await api('/info')).demo; } catch { state.demo = false; }
    state.user = me.user; state.config = me.config;
    state.can = p => state.user.perms.includes(p);
    if (me.user.must_change) { renderShell(); return forcePasswordChange(); }
    renderShell(); route();
    if (!tourVisto()) { const uid = me.user.id; setTimeout(() => { if (state.user?.id === uid && !tourVisto()) iniciarTour(); }, 700); } // primeiro acesso deste usuário (só se ele ainda estiver logado)
  } catch (e) {
    if (e.status === 401 || e.status === 0) renderLogin(e.status === 0 ? e.message : '', { auto: e.status === 401 }); else renderLogin(e.message);
  }
}

const lerCookie = n => { const x = document.cookie.split('; ').find(c => c.startsWith(n + '=')); return x ? decodeURIComponent(x.slice(n.length + 1)) : ''; };
const gravarCookie = (n, v) => { document.cookie = `${n}=${encodeURIComponent(v)}; Max-Age=31536000; Path=/; SameSite=Lax`; };

async function renderLogin(msg = '', { auto = false } = {}) {
  state.user = null;
  let info = {}; try { info = await api('/info'); } catch { /* servidor fora */ }
  state.demo = !!info.demo;
  if (info.demo && auto) { // demonstração: entra sozinho, sem senha
    try { await api('/login', { method: 'POST', body: { username: 'master', password: 'demo-friogest' } }); return boot(); } catch { /* cai no formulário */ }
  }
  const logo = `<div class="logo"><i>${icon('snowflake', 20)}</i><div>FrioGest<small>Vendas, orçamentos, estoque e serviços</small></div></div>`;
  const feats = [['shopping-cart', 'PDV rápido, orçamentos e ordens de serviço'], ['package', 'Estoque, gás por cilindro e entrada por XML da NF-e'], ['circle-dollar-sign', 'Financeiro, caixa do dia e relatórios'], ['save', 'Funciona 100% no seu computador, com backup diário']];
  root.innerHTML = `<div class="login"><section class="hero">${logo.replace('<small>Vendas, orçamentos, estoque e serviços</small>', '')}
      <div><h2>Gestão completa para a sua loja de refrigeração</h2><p>Venda, orce, controle o estoque e o gás, e acompanhe cada ordem de serviço — tudo em um só lugar.</p>
      <ul>${feats.map(f => `<li><i>${icon(f[0], 17)}</i>${f[1]}</li>`).join('')}</ul></div>
      <div class="foot">Versão ${esc(info.versao || '')}</div></section>
    <div class="side-form"><div class="box">${logo.replace('class="logo"', 'class="logo mini"')}
    <h1>Entrar</h1><p class="sub">Acesse com seu usuário e senha.</p>
    <form id="lf"><label class="f">Usuário<input name="username" autocomplete="username" value="${esc(lerCookie('fg_user'))}" ${lerCookie('fg_user') ? '' : 'autofocus'}></label>
    <label class="f">Senha<input name="password" type="password" autocomplete="current-password" ${lerCookie('fg_user') ? 'autofocus' : ''}></label>
    <label class="f chk"><span><input type="checkbox" name="lembrar" ${lerCookie('fg_manter') !== '0' ? 'checked' : ''}> Manter conectado neste computador (não guarda a senha)</span></label>
    <div class="alert err ${msg ? '' : 'hide'}" id="lerr">${esc(msg)}</div>
    <button class="btn p lg">Entrar</button>
    ${info.primeiro_acesso && !info.demo ? `<div class="alert info small">Primeiro acesso? Entre com o usuário <b>master</b> e a senha <b>master123</b>. O sistema vai pedir para você criar uma senha nova.</div>` : ''}
    </form>
    ${info.demo ? `<div class="demo-card"><div><b>Modo demonstração</b> — dados fictícios, nada é gravado de verdade.</div><button class="btn p" id="demo-go" type="button">${icon('play', 15)} Entrar na demonstração</button></div>` : ''}</div></div></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const b = getForm(e.target);
    try {
      await api('/login', { method: 'POST', body: { ...b, lembrar: !!b.lembrar } });
      gravarCookie('fg_user', String(b.username || '').trim()); gravarCookie('fg_manter', b.lembrar ? '1' : '0'); // lembra o usuário (nunca a senha)
      boot();
    }
    catch (err) { const el = $('#lerr'); el.textContent = err.message; el.classList.remove('hide'); $('[name=password]').select(); }
  };
  if ($('#demo-go')) $('#demo-go').onclick = async () => { try { await api('/login', { method: 'POST', body: { username: 'master', password: 'demo-friogest' } }); boot(); } catch (err) { fail(err); } };
}

function renderShell() {
  const items = NAV.filter(allowed);
  const ini = String(state.user.nome || '?').split(/\s+/).map(x => (x.match(/\p{L}/u) || [''])[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const demoBar = state.demo ? `<div class="demo-bar">${icon('eye', 15)} MODO DEMONSTRAÇÃO — dados fictícios para você conhecer o sistema. Pode mexer à vontade: tudo é descartado ao fechar.</div>` : '';
  let mini = false; try { mini = localStorage.getItem('fg_side_mini') === '1'; } catch { /* sem storage: abre normal */ }
  root.innerHTML = `<div id="app"><aside class="side${mini ? ' mini' : ''}" id="side"><div class="logo"><i>${icon('snowflake', 20)}</i><div class="lt">FrioGest<small>${esc(state.config.loja_nome || '')}</small></div></div>
    ${items.map(n => { const t = n.r === 'os' && !state.can('os.gerir') ? 'Minhas OS / Agenda' : n.t; return n.grp ? `<div class="navgrp"><span>${n.grp}</span></div>` : `<a class="nav" data-r="${n.r}" href="#/${n.r}" title="${esc(t)}"><b>${icon(n.i, 18)}</b><span class="nl">${esc(t)}</span></a>`; }).join('')}
    <div class="side-foot"><div class="user">
      <div class="uhead"><div class="uav">${esc(ini)}</div><div class="uinfo"><div class="un">${esc(state.user.nome)}</div><span>${esc(ROLES[state.user.role] || state.user.role)}</span></div></div>
      <div class="uacts">${state.demo ? '' : `<button class="uact" id="chpw" type="button" title="Trocar senha">${icon('key-round', 16)}<span>Senha</span></button>`}<button class="uact" id="tour" type="button" title="Tour guiado">${icon('compass', 16)}<span>Tour</span></button><button class="uact sair" id="lo" type="button" title="Sair">${icon('log-out', 16)}<span>Sair</span></button></div>
      <button class="ver" id="ver" type="button"><b id="ver-i"></b><span class="vt"><span id="ver-n">Versão</span><small id="ver-s"></small></span></button>
    </div></div></aside>
    <div class="main">${demoBar}<div id="up-bar"></div><div id="bk-bar"></div><div class="top"><button class="burger" id="burger" aria-label="Menu">${icon('menu', 22)}</button><h1 id="title"></h1><div class="sp"></div><div id="actions" class="bar" style="margin:0"></div></div><div id="view"></div></div></div>`;
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#side').addEventListener('click', e => {
    if (e.target.closest('.nav')) $('#side').classList.remove('open');
    // clicar na barra (fora dos itens, do bloco de versão e dos links do usuário) abre/recolhe o menu — só no computador
    if (e.target.closest('a, button') || !matchMedia('(min-width:981px)').matches) return;
    const m = $('#side').classList.toggle('mini');
    try { localStorage.setItem('fg_side_mini', m ? '1' : '0'); } catch { /* ignora */ }
  });
  $('#lo').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); renderLogin(); };
  if ($('#chpw')) $('#chpw').onclick = () => changePasswordModal(false);
  $('#tour').onclick = () => { $('#side').classList.remove('open'); iniciarTour({ marcar: false }); };
  checarBackupExterno();
  ligarAtualizacao();
}

// Atualização do programa: bloco "Versão" no menu lateral + faixa azul quando há versão nova.
// Só funciona no programa instalado. Para ver no navegador, abra com ?simular-update=pronta
// (ou =baixando, =atual, =erro).
let versaoApp = '';
async function ligarAtualizacao() {
  const sim = new URLSearchParams(location.search).get('simular-update');
  const up = window.friogest?.update;
  try { versaoApp = (await api('/info')).versao || ''; } catch { /* ignora */ }
  const v = versaoApp && versaoApp !== 'dev' ? `Versão ${versaoApp}` : 'Versão de desenvolvimento';
  let atual = { estado: 'indisponivel' };

  const desenhar = s => {
    atual = s;
    const bt = $('#ver'); if (!bt) return;
    const novo = esc(s.versao || '');
    const mapa = {
      indisponivel: ['circle-check', v, 'Só no programa instalado', ''],
      ocioso: ['refresh-cw', v, 'Verificar agora', ''],
      atual: ['circle-check', v, 'Atualizado', 'ok'],
      checando: ['refresh-cw', v, 'Verificando…', 'gira'],
      baixando: ['download', `Versão ${novo}`, `Baixando… ${s.percent || 0}%`, 'gira nova'],
      pronta: ['download', `Versão ${novo}`, 'Clique para atualizar', 'pronta nova'],
      erro: ['refresh-cw', v, 'Sem conexão · tentar de novo', 'erro'],
    };
    const [ic, t, sub, cls] = mapa[s.estado] || mapa.indisponivel;
    bt.className = 'ver ' + cls;
    bt.title = `${t} — ${sub}. Clique para ${s.estado === 'pronta' ? 'reiniciar e atualizar' : 'verificar atualizações'}.`.replace(/&[a-z]+;/g, '');
    $('#ver-i').innerHTML = icon(ic, 18);
    $('#ver-n').innerHTML = t; $('#ver-s').innerHTML = sub;

    const el = $('#up-bar'); if (!el) return;
    if (s.estado === 'pronta') {
      el.className = 'bk-bar info';
      el.innerHTML = `${icon('download', 15)} A versão ${novo} do FrioGest está pronta. <button class="btn p" id="up-go" type="button">Reiniciar e atualizar</button>`;
      $('#up-go').onclick = instalar;
    } else { el.className = ''; el.innerHTML = ''; }
  };
  const instalar = () => (up ? up.install() : toast('Simulação: aqui o programa reiniciaria', 'ok'));

  $('#ver').onclick = async () => {
    if (atual.estado === 'pronta') return instalar();
    if (sim) { desenhar({ estado: 'checando' }); setTimeout(() => desenhar({ estado: 'atual' }), 1200); return; }
    if (!up) return toast('As atualizações automáticas funcionam no programa instalado.', 'ok');
    if (atual.estado === 'checando' || atual.estado === 'baixando') return;
    desenhar({ estado: 'checando' });
    try { desenhar(await up.check()); } catch { desenhar({ estado: 'erro' }); }
  };

  if (sim) { desenhar({ estado: ['baixando', 'atual', 'erro'].includes(sim) ? sim : 'pronta', versao: '1.0.2', percent: 42 }); return; }
  desenhar(atual);
  if (up) { up.status().then(desenhar).catch(() => {}); up.onStatus(desenhar); }
}

// Faixa de alerta da cópia externa do backup (só para quem pode ver backups; não aparece na demonstração)
async function checarBackupExterno() {
  const el = $('#bk-bar');
  if (!el || !state.user || state.user.must_change || state.demo || !state.can('backup')) return;
  try {
    const s = await api('/backups/status');
    if (!$('#bk-bar')) return;
    const link = '<a href="#/backup">Resolver</a>';
    const oculto = s.nivel === 'desligado' && s.aviso_oculto;
    el.className = s.nivel === 'ok' || oculto ? '' : s.nivel === 'desligado' ? 'bk-bar aviso' : 'bk-bar perigo';
    el.innerHTML = oculto ? '' : s.nivel === 'desligado' ? `${icon('triangle-alert', 15)} Seus backups estão só neste computador. Configure a cópia externa (pendrive ou Google Drive). ${link}<button class="bk-x" id="bk-x" type="button" title="Não quero cópia externa, usar só o backup local" aria-label="Fechar aviso">${icon('x', 15)}</button>`
      : s.nivel === 'atrasado' ? `${icon('triangle-alert', 15)} ${s.ultimo ? `Faz ${s.dias} dia(s) sem cópia de segurança externa.` : 'A cópia de segurança externa ainda não foi feita.'}${s.erro ? ' ' + esc(s.erro) + '.' : ''} ${link}` : '';
    const x = $('#bk-x');
    if (x) x.onclick = async () => { try { await api('/backups/ocultar-aviso', { method: 'POST' }); } catch { /* ignora */ } el.className = ''; el.innerHTML = ''; };
  } catch { /* sem permissão ou servidor fora: não incomoda */ }
}
window.addEventListener('friogest:backup', checarBackupExterno);
setInterval(() => { if (state.user) checarBackupExterno(); }, 30 * 60 * 1000);

function changePasswordModal(forced) {
  modal({ title: forced ? 'Crie uma nova senha para continuar' : 'Trocar senha', closable: !forced,
    html: `${forced ? '<div class="alert warn">Por segurança, troque a senha provisória antes de usar o sistema.</div>' : ''}<div class="stack">
      ${fld('Senha atual', '<input name="atual" type="password" autocomplete="current-password">')}
      ${fld('Nova senha (mínimo 6 caracteres)', '<input name="nova" type="password" autocomplete="new-password">')}
      ${fld('Repita a nova senha', '<input name="rep" type="password" autocomplete="new-password">')}</div>`,
    buttons: [...(forced ? [{ label: 'Sair', onClick: async () => { await api('/logout', { method: 'POST' }).catch(() => {}); renderLogin(); } }] : [{ label: 'Cancelar' }]),
      { label: 'Salvar senha', cls: 'p', onClick: async m => {
        const f = getForm(m.body);
        if (f.nova !== f.rep) throw new Error('As senhas novas não são iguais');
        await api('/me/senha', { method: 'POST', body: { atual: f.atual, nova: f.nova } });
        toast('Senha alterada', 'ok'); if (forced) boot();
      } }] });
}
const forcePasswordChange = () => changePasswordModal(true);

// ---------- rotas ----------
async function route() {
  if (!state.user || state.user.must_change) return;
  const [pathPart, qs] = (location.hash.slice(2) || 'painel').split('?');
  const [name, ...params] = pathPart.split('/');
  const nav = NAV.find(n => n.r === name && allowed(n)) || NAV.find(n => n.r === 'painel');
  $$('.nav').forEach(a => a.classList.toggle('on', a.dataset.r === nav.r));
  const token = (current = {});
  $$('.ov').forEach(o => o.remove());
  const view = $('#view'); view.innerHTML = '<div class="empty">Carregando…</div>';
  const ctx = {
    params: nav.r === name ? params : [], query: new URLSearchParams(qs || ''),
    top: (title, actionsHtml = '') => { $('#title').textContent = title; $('#actions').innerHTML = actionsHtml; document.title = `${title} · FrioGest`; return $('#actions'); },
    isCurrent: () => current === token, go: h => { location.hash = '#/' + h; }, reload: route,
  };
  try {
    const mod = await import(`./views/${nav.mod}.js`);
    if (current !== token) return;
    view.innerHTML = '';
    await (nav.fn ? mod[nav.fn] : mod.default)(view, ctx);
    view.scrollTop = 0;
  } catch (e) { console.error(e); if (current === token) view.innerHTML = `<div class="alert err">Erro ao abrir a tela: ${esc(e.message)}</div>`; }
}

window.addEventListener('hashchange', route);
window.addEventListener('friogest:logout', () => { if (state.user) { toast('Sua sessão expirou. Entre novamente.', 'err'); renderLogin(); } });
window.addEventListener('friogest:mustchange', () => forcePasswordChange());
document.addEventListener('keydown', e => { if (e.key === 'F5' && !isElectron) return; });
boot();
