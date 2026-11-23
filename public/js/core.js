// Utilitários compartilhados pelas telas
import { icon } from './icons.js';
export { icon };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (n, max = 3) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: max });
export const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const pad = n => String(n).padStart(2, '0');
export const fdate = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
export const fdt = s => (s ? `${fdate(s)} ${String(s).slice(11, 16)}` : '');
export const todayStr = (add = 0) => { const d = new Date(); d.setDate(d.getDate() + add); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const state = { user: null, config: {}, can: () => false };
export const isElectron = !!window.friogest;

export const FORMAS = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro', fiado: 'Fiado', boleto: 'Boleto' };
export const ROLES = { master: 'Master', supervisor: 'Supervisor', vendedor: 'Vendedor', tecnico: 'Técnico' };
export const TIPOS_OS = { instalacao: 'Instalação', corretiva: 'Manutenção corretiva', preventiva: 'Manutenção preventiva', visita: 'Visita técnica', outro: 'Outro' };
export const STATUS_OS = { aberta: ['Aberta', 't-lj'], agendada: ['Agendada', 't-az'], em_andamento: ['Em andamento', 't-az'], concluida: ['Concluída', 't-vd'], faturada: ['Faturada', 't-vd'], cancelada: ['Cancelada', 't-cz'] };
export const STATUS_ORC = { rascunho: ['Rascunho', 't-cz'], enviado: ['Enviado', 't-lj'], aprovado: ['Aprovado', 't-vd'], recusado: ['Recusado', 't-vm'], expirado: ['Expirado', 't-cz'], convertido: ['Convertido', 't-vd'] };
export const tag = (map, k) => { const [t, c] = map[k] || [k, 't-cz']; return `<span class="tag ${c}">${esc(t)}</span>`; };
export const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(Array.isArray(v) ? v[0] : v)}</option>`).join('');

export class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data; } }
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'friogest' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new ApiError('Sem conexão com o servidor do FrioGest', 0); }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') window.dispatchEvent(new CustomEvent('friogest:logout'));
    if (res.status === 403 && data?.must_change) window.dispatchEvent(new CustomEvent('friogest:mustchange'));
    throw new ApiError(data?.erro || `Erro ${res.status}`, res.status, data);
  }
  return data;
}

export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3200);
}
export const fail = e => { console.error(e); toast(e.message || String(e), 'err'); };

// Janela modal. buttons: [{label, cls, onClick(ctrl) -> false para manter aberta}]
export function modal({ title, html, size = '', buttons = [], onOpen, onClose, closable = true }) {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="modal ${size}" role="dialog"><header><h2>${esc(title)}</h2>${closable ? `<button type="button" data-x aria-label="Fechar">${icon('x', 20)}</button>` : ''}</header>
    <div class="mb">${html || ''}</div><footer><span class="m-err"></span></footer></div>`;
  document.body.appendChild(ov);
  const ctrl = {
    el: ov, body: $('.mb', ov),
    close: () => { if (!ov.isConnected) return; ov.remove(); document.removeEventListener('keydown', onKey); onClose?.(); },
    error: m => { $('.m-err', ov).textContent = m || ''; },
  };
  const onKey = e => { if (e.key === 'Escape' && closable && ov === [...document.querySelectorAll('.ov')].pop()) ctrl.close(); };
  document.addEventListener('keydown', onKey);
  if (closable) $('[data-x]', ov).onclick = ctrl.close;
  const foot = $('footer', ov);
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn ' + (b.cls || ''); btn.innerHTML = b.label; // rótulos são literais do código (podem conter ícone)
    btn.onclick = async () => {
      ctrl.error('');
      btn.disabled = true;
      try { const r = await b.onClick?.(ctrl); if (r !== false && !b.keep) ctrl.close(); }
      catch (e) { ctrl.error(e.message || String(e)); }
      finally { btn.disabled = false; }
    };
    foot.appendChild(btn);
  }
  if (!buttons.length) foot.remove();
  onOpen?.(ctrl);
  const first = $('input:not([type=hidden]):not([readonly]),select,textarea', ov); first?.focus();
  return ctrl;
}
export const confirmBox = ({ title = 'Confirmar', msg, ok = 'Confirmar', danger = false }) => new Promise(res => {
  modal({ title, html: `<p style="line-height:1.5">${esc(msg)}</p>`, onClose: () => res(false), buttons: [
    { label: 'Cancelar' },
    { label: ok, cls: danger ? 'd' : 'p', onClick: () => res(true) }] });
});
export const promptBox = ({ title, label, value = '', ok = 'Confirmar', multiline = false, type = 'text' }) => new Promise(res => {
  modal({ title, html: `<label class="f">${esc(label)}${multiline ? `<textarea name="v">${esc(value)}</textarea>` : `<input name="v" type="${type}" value="${esc(value)}">`}</label>`, onClose: () => res(null), buttons: [
    { label: 'Cancelar' },
    { label: ok, cls: 'p', onClick: c => { const v = $('[name=v]', c.body).value.trim(); if (!v) throw new Error('Preencha o campo'); res(v); } }] });
});

// Lê os campos [name] de um container
export function getForm(root) {
  const o = {};
  for (const el of $$('[name]', root)) {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.type === 'number') o[el.name] = el.value === '' ? '' : parseFloat(el.value);
    else o[el.name] = el.value;
  }
  return o;
}
export const fld = (label, inner, cls = '') => `<label class="f ${cls}">${esc(label)}${inner}</label>`;
export const inp = (name, v = '', extra = '') => `<input name="${name}" value="${esc(v)}" ${extra}>`;

export function table(cols, rows, { empty = 'Nada por aqui ainda.', click = false } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="tblwrap"><table><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) =>
    `<tr ${click ? `class="click" data-i="${i}"` : ''}>${cols.map(c => `<td class="${c.cls || ''}">${c.f(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// Campo de busca com lista suspensa. search(q) -> Promise<array>; render(item) -> html; onPick(item)
export function attachPicker(input, { search, render, onPick, onEnterEmpty, minChars = 1, clearOnPick = true }) {
  const wrap = input.parentElement; wrap.classList.add('searchbox');
  const drop = document.createElement('div'); drop.className = 'drop hide'; wrap.appendChild(drop);
  let items = []; let idx = 0; let seq = 0;
  const show = () => { drop.classList.toggle('hide', !items.length); [...drop.children].forEach((c, i) => c.classList.toggle('on', i === idx)); };
  const run = debounce(async () => {
    const q = input.value.trim(); const my = ++seq;
    if (q.length < minChars) { items = []; return show(); }
    try { const r = await search(q); if (my !== seq) return; items = r; idx = 0;
      drop.innerHTML = items.map((x, i) => `<div class="it" data-i="${i}">${render(x)}</div>`).join('') || '';
      if (!items.length) drop.innerHTML = '<div class="it muted">Nada encontrado</div>';
      drop.classList.remove('hide'); show(); if (!items.length) drop.querySelector('.it').dataset.none = 1;
    } catch (e) { fail(e); }
  }, 200);
  const pick = i => { const it = items[i]; if (!it) return; drop.classList.add('hide'); if (clearOnPick) input.value = ''; items = []; onPick(it); };
  input.addEventListener('input', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, items.length - 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); show(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (items.length) { pick(idx); e.preventDefault(); } else if (input.value.trim()) { onEnterEmpty ? onEnterEmpty(input.value.trim()) : run(); e.preventDefault(); } }
    else if (e.key === 'Escape') drop.classList.add('hide');
  });
  drop.addEventListener('mousedown', e => { const it = e.target.closest('.it'); if (it && it.dataset.i !== undefined) { e.preventDefault(); pick(+it.dataset.i); } });
  input.addEventListener('blur', () => setTimeout(() => drop.classList.add('hide'), 150));
  return { search: run };
}

export const productSearch = (extra = '') => q => api(`/produtos?limit=12&q=${encodeURIComponent(q)}${extra}`);
export const productRow = p => `<div><b>${esc(p.descricao)}</b><div class="muted small">${esc(p.codigo || '')}${p.cod_fabricante ? ' · fab. ' + esc(p.cod_fabricante) : ''}${p.tipo === 'peca' ? ` · estoque ${num(p.estoque)} ${esc(p.unidade)}` : ' · serviço'}</div></div><div class="b nowrap">${brl(p.preco)}</div>`;

// Cliente: componente de seleção. ctx.value = cliente|null
export function clientePicker(root, { value = null, onChange, allowNew = true }) {
  root.innerHTML = `<div class="searchbox"><input placeholder="Buscar cliente por nome, CPF/CNPJ ou telefone…" autocomplete="off"></div>
    <div class="sel hide" style="display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid #cfd9e3;border-radius:8px;padding:8px 10px;background:#fff"><span></span><span class="nowrap"><a data-edit>trocar</a></span></div>`;
  const inputEl = $('input', root); const sel = $('.sel', root);
  const set = c => {
    value = c;
    inputEl.parentElement.classList.toggle('hide', !!c); sel.classList.toggle('hide', !c);
    if (c) $('span', sel).innerHTML = `${icon('user', 15)} <b>${esc(c.nome)}</b> <span class="muted small">${esc(c.telefone || '')}${c.doc ? ' · ' + esc(c.doc) : ''}</span>`;
    onChange?.(c);
  };
  attachPicker(inputEl, { search: q => api('/clientes?q=' + encodeURIComponent(q)), render: c => `<div><b>${esc(c.nome)}</b><div class="muted small">${esc(c.telefone || '')} ${esc(c.doc || '')}</div></div>`, onPick: set });
  $('[data-edit]', sel).onclick = () => { set(null); inputEl.focus(); };
  if (allowNew && state.can('cliente.gerir')) {
    const b = document.createElement('a'); b.textContent = '+ Novo cliente'; b.style.cssText = 'font-size:12px;display:inline-block;margin-top:4px'; root.appendChild(b);
    b.onclick = () => clienteModal(null, c => set(c));
  }
  set(value);
  return { get: () => value, set };
}

export function clienteModal(cli, onSaved) {
  const c = cli || {};
  modal({ title: cli ? 'Editar cliente' : 'Novo cliente', html: `<div class="stack">
    ${fld('Nome *', inp('nome', c.nome))}<div class="grid2">${fld('CPF / CNPJ', inp('doc', c.doc))}${fld('Telefone / WhatsApp', inp('telefone', c.telefone, 'type="tel" placeholder="(21) 99999-9999"'))}</div>
    ${fld('E-mail', inp('email', c.email, 'type="email"'))}${fld('Endereço', inp('endereco', c.endereco))}${fld('Observações', `<textarea name="obs">${esc(c.obs)}</textarea>`)}</div>`,
  buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => {
    const body = getForm(m.body);
    const r = cli ? await api(`/clientes/${cli.id}`, { method: 'PUT', body }) : await api('/clientes', { method: 'POST', body });
    toast('Cliente salvo', 'ok'); onSaved?.({ ...c, ...body, id: cli ? cli.id : r.id });
  } }] });
}

// ---------- PDF / WhatsApp ----------
export async function savePdf(path, filename) {
  if (window.friogest?.savePdf) return window.friogest.savePdf({ path, filename });
  window.open(path + '?print=1', '_blank'); return null;
}
export const onlyDigits = s => String(s || '').replace(/\D/g, '');
export function waLink(phone, text) {
  let d = onlyDigits(phone); if (d && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
export async function openExternal(url) {
  if (window.friogest?.openExternal) return window.friogest.openExternal(url);
  window.open(url, '_blank'); return null;
}
export const fillMsg = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// Envia documento: gera PDF, abre a conversa do cliente no WhatsApp com a mensagem pronta
export async function sendWhatsApp({ phone, text, pdfPath, pdfName }) {
  if (!onlyDigits(phone)) throw new Error('O cliente não tem telefone cadastrado');
  const r = await savePdf(pdfPath, pdfName);
  await openExternal(waLink(phone, text));
  if (r?.path) modal({ title: 'Orçamento pronto para enviar', html: `<div class="alert ok">O WhatsApp foi aberto na conversa do cliente com a mensagem pronta.</div>
    <p style="line-height:1.6">O PDF foi salvo em:<br><b>${esc(r.path)}</b></p><p class="muted" style="margin-top:8px">A pasta foi aberta: arraste o arquivo <b>${esc(pdfName)}</b> para a conversa e envie.</p>`, buttons: [{ label: 'Entendi', cls: 'p' }] });
  else toast('WhatsApp aberto. Use "Imprimir > Salvar como PDF" na outra aba para anexar o arquivo.');
}

export function csv(nome, cols, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const txt = '﻿' + [cols.map(c => q(c.h)).join(';'), ...rows.map(r => cols.map(c => q(c.v(r))).join(';'))].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function resizeImage(file, max = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    img.src = url;
  });
}

// ---------- impressora térmica (cupom não fiscal) ----------
export const impressoraAtiva = () => (state.config?.impressora_modo || 'desligada') !== 'desligada';
/** Imprime o cupom (venda | os | orcamento | teste). Térmica: o servidor envia ESC/POS. Impressora comum: abre/imprime a página de 80 mm. */
export async function imprimirCupom(tipo, id) {
  if (!impressoraAtiva()) { toast('Configure a impressora em Configurações', 'err'); return false; }
  try {
    const r = await api(`/impressao/${tipo}${tipo === 'teste' ? '' : '/' + id}`, { method: 'POST' });
    if (r.abrir) { // impressora comum
      if (window.friogest?.printCupom) {
        const x = await window.friogest.printCupom({ path: r.abrir, deviceName: r.nome || '' });
        if (x?.ok) toast('Cupom enviado para a impressora', 'ok');
        else if (x?.why && !/cancel/i.test(x.why)) toast('Não consegui imprimir: ' + x.why, 'err');
        else toast('Impressão cancelada');
      } else window.open(r.abrir + '?print=1', '_blank'); // navegador: abre a janela de impressão (escolha a impressora)
      return true;
    }
    toast('Cupom enviado para a impressora', 'ok'); return true;
  } catch (e) { fail(e); return false; }
}
