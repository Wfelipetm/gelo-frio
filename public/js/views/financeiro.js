import { icon, $, $$, esc, api, brl, fdate, todayStr, state, table, modal, toast, fail, getForm, fld, inp, FORMAS, opts, confirmBox, clientePicker } from '../core.js';

export default async function (root, ctx) {
  const gerir = state.can('fin.gerir');
  let tab = 'receber', sit = 'abertos';
  ctx.top('Financeiro', gerir ? '<button class="btn p" id="novo">' + icon('plus') + ' Novo lançamento</button>' : '');
  root.innerHTML = `<div class="tabs" id="tabs">${[['receber', 'A receber'], ['pagar', 'A pagar'], ['caixa', 'Caixa do dia']].map(([k, v]) => `<div class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${v}</div>`).join('')}</div><div id="tb"></div>`;
  const show = async () => { $$('#tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === tab)); await (tab === 'caixa' ? caixa : lista)(); };
  $$('#tabs .tab').forEach(t => t.onclick = () => { tab = t.dataset.t; show().catch(fail); });

  async function lista() {
    const rows = await api(`/lancamentos?tipo=${tab}&situacao=${sit}`);
    const hoje = todayStr(); const tot = rows.reduce((s, l) => s + l.valor, 0);
    $('#tb').innerHTML = `<div class="bar"><div class="chips" id="sc">${[['abertos', 'Em aberto'], ['vencidos', 'Vencidos'], ['pagos', 'Pagos'], ['', 'Todos']].map(([k, v]) => `<span class="chip ${k === sit ? 'on' : ''}" data-s="${k}">${v}</span>`).join('')}</div><div class="grow"></div><b>Total: ${brl(tot)}</b></div>
    <div class="card">${table([{ h: 'Vencimento', f: l => `<span class="${!l.pago && l.vencimento < hoje ? 'dn b' : ''}">${fdate(l.vencimento)}</span>` }, { h: 'Descrição', f: l => `<b>${esc(l.descricao)}</b><div class="muted small">${esc(l.cliente || l.pessoa || '')}</div>` },
      { h: 'Valor', cls: 'r', f: l => `<b>${brl(l.valor)}</b>` }, { h: 'Situação', f: l => l.pago ? `<span class="tag t-vd">Pago ${fdate(l.pago_em)} · ${esc(FORMAS[l.forma] || '')}</span>` : '<span class="tag t-lj">Em aberto</span>' },
      ...(gerir ? [{ h: '', cls: 'r nowrap', f: (l, i) => (l.pago ? '' : `<a data-b="${i}">dar baixa</a>`) + (!l.pago && ['manual', 'entrada'].includes(l.origem) ? ` · <a data-x="${i}">excluir</a>` : '') }] : [])], rows, { empty: 'Nada por aqui.' })}</div>`;
    $$('#sc .chip').forEach(c => c.onclick = () => { sit = c.dataset.s; lista().catch(fail); });
    $$('[data-b]').forEach(a => a.onclick = () => { const l = rows[+a.dataset.b];
      modal({ title: 'Dar baixa', html: `<p><b>${esc(l.descricao)}</b> — ${brl(l.valor)}</p><div class="stack">${fld('Forma', `<select name="forma">${opts(FORMAS, 'pix')}</select>`)}${fld('Data', `<input name="data" type="date" value="${todayStr()}">`)}</div>`,
        buttons: [{ label: 'Cancelar' }, { label: 'Confirmar', cls: 'v', onClick: async m => { await api(`/lancamentos/${l.id}/baixar`, { method: 'POST', body: getForm(m.body) }); toast('Baixa registrada', 'ok'); lista().catch(fail); } }] }); });
    $$('[data-x]').forEach(a => a.onclick = async () => { const l = rows[+a.dataset.x]; if (await confirmBox({ msg: `Excluir "${l.descricao}"?`, ok: 'Excluir', danger: true })) { await api('/lancamentos/' + l.id, { method: 'DELETE' }).catch(fail); lista().catch(fail); } });
  }
  async function caixa(dia = todayStr()) {
    const c = await api('/caixa?data=' + dia);
    $('#tb').innerHTML = `<div class="bar"><input type="date" id="dia" value="${c.data}"></div><div class="kpis"><div class="card kpi"><div class="l">Entradas</div><div class="n up">${brl(c.entradas)}</div></div><div class="card kpi"><div class="l">Saídas</div><div class="n dn">${brl(c.saidas)}</div></div><div class="card kpi"><div class="l">Saldo</div><div class="n">${brl(c.saldo)}</div></div></div>
    <div class="chips" style="margin:12px 0">${Object.entries(c.porForma).map(([f, v]) => `<span class="chip">${esc(FORMAS[f] || f)}: ${brl(v)}</span>`).join('')}</div>
    <div class="card">${table([{ h: 'Descrição', f: l => esc(l.descricao) }, { h: 'Forma', f: l => esc(FORMAS[l.forma] || '') }, { h: 'Valor', cls: 'r', f: l => `<b class="${l.tipo === 'pagar' ? 'dn' : 'up'}">${l.tipo === 'pagar' ? '−' : '+'}${brl(l.valor)}</b>` }], c.movimentos, { empty: 'Sem movimentos neste dia.' })}</div>`;
    $('#dia').onchange = e => caixa(e.target.value).catch(fail);
  }
  if ($('#novo')) $('#novo').onclick = () => {
    let cli = null;
    modal({ title: 'Novo lançamento', html: `<div class="stack">${fld('Tipo', '<select name="tipo"><option value="receber">A receber</option><option value="pagar">A pagar</option></select>')}${fld('Descrição *', inp('descricao'))}<div class="grid2">${fld('Valor (R$) *', '<input name="valor" type="number" step="0.01">')}${fld('Vencimento', `<input name="vencimento" type="date" value="${todayStr()}">`)}</div>${fld('Fornecedor / pessoa', inp('pessoa'))}<label class="f"><span><input type="checkbox" name="pago"> Já está pago</span></label>${fld('Forma (se pago)', `<select name="forma">${opts(FORMAS, 'pix')}</select>`)}</div>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => { await api('/lancamentos', { method: 'POST', body: { ...getForm(m.body), cliente_id: cli } }); toast('Lançado', 'ok'); show().catch(fail); } }] });
  };
  await show();
}
