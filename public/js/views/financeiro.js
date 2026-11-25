import { icon, $, $$, esc, api, brl, fdate, todayStr, state, table, modal, toast, fail, getForm, fld, inp, FORMAS, opts, confirmBox, clientePicker } from '../core.js';

export default async function (root, ctx) {
  const gerir = state.can('fin.gerir');
  let tab = 'receber', sit = 'abertos';
  ctx.top('Financeiro', gerir ? '<button class="btn p" id="novo">' + icon('plus') + ' Novo lançamento</button>' : '');
  root.innerHTML = `<div class="tabs" id="tabs">${[['receber', 'A receber'], ['pagar', 'A pagar'], ['caixa', 'Caixa do dia'], ['rec', 'Contas fixas']].map(([k, v]) => `<div class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${v}</div>`).join('')}</div><div id="tb"></div>`;
  const show = async () => { $$('#tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === tab)); const nb = $('#novo'); if (nb) nb.innerHTML = icon('plus') + (tab === 'rec' ? ' Nova conta fixa' : ' Novo lançamento'); await (tab === 'caixa' ? caixa : tab === 'rec' ? recorrentes : lista)(); };
  $$('#tabs .tab').forEach(t => t.onclick = () => { tab = t.dataset.t; show().catch(fail); });

  async function lista() {
    const rows = await api(`/lancamentos?tipo=${tab}&situacao=${sit}`);
    const hoje = todayStr(); const tot = rows.reduce((s, l) => s + l.valor, 0);
    $('#tb').innerHTML = `<div class="bar"><div class="chips" id="sc">${[['abertos', 'Em aberto'], ['vencidos', 'Vencidos'], ['pagos', 'Pagos'], ['', 'Todos']].map(([k, v]) => `<span class="chip ${k === sit ? 'on' : ''}" data-s="${k}">${v}</span>`).join('')}</div><div class="grow"></div><b>Total: ${brl(tot)}</b></div>
    <div class="card">${table([{ h: 'Vencimento', f: l => `<span class="${!l.pago && l.vencimento < hoje ? 'dn b' : ''}">${fdate(l.vencimento)}</span>` }, { h: 'Descrição', f: l => `<b>${esc(l.descricao)}</b>${l.origem === 'estorno' ? ' <span class="tag t-lj">estorno</span>' : l.origem === 'recorrente' ? ' <span class="tag t-az">conta fixa</span>' : ''}<div class="muted small">${esc(l.cliente || l.pessoa || '')}</div>` },
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
    <div class="card">${table([{ h: 'Descrição', f: l => esc(l.descricao) + (l.origem === 'estorno' ? ' <span class="tag t-lj">estorno</span>' : '') }, { h: 'Forma', f: l => esc(FORMAS[l.forma] || '') }, { h: 'Valor', cls: 'r', f: l => `<b class="${l.tipo === 'pagar' ? 'dn' : 'up'}">${l.tipo === 'pagar' ? '−' : '+'}${brl(l.valor)}</b>` }], c.movimentos, { empty: 'Sem movimentos neste dia.' })}</div>`;
    $('#dia').onchange = e => caixa(e.target.value).catch(fail);
  }
  // contas fixas: o sistema lança sozinho uma conta por mês (aluguel, luz, internet, salários…)
  async function recorrentes() {
    const rows = await api('/recorrencias');
    $('#tb').innerHTML = `<div class="alert info small" style="margin-bottom:12px">As contas fixas são lançadas <b>sozinhas, uma vez por mês</b>, em A pagar (ou A receber), com o vencimento no dia escolhido. Você só precisa dar baixa quando pagar.</div>
      <div class="card">${table([{ h: 'Tipo', f: x => x.tipo === 'pagar' ? '<span class="tag t-vm">A pagar</span>' : '<span class="tag t-vd">A receber</span>' }, { h: 'Descrição', f: x => `<b>${esc(x.descricao)}</b>${x.pessoa ? `<div class="muted small">${esc(x.pessoa)}</div>` : ''}` },
        { h: 'Valor', cls: 'r', f: x => `<b>${brl(x.valor)}</b>` }, { h: 'Todo dia', cls: 'r', f: x => x.dia }, { h: 'Situação', f: x => x.ativo ? '<span class="tag t-vd">Ativa</span>' : '<span class="tag t-cz">Pausada</span>' },
        ...(gerir ? [{ h: '', cls: 'r nowrap', f: (x, i) => `<a data-re="${i}">editar</a> · <a data-rp="${i}">${x.ativo ? 'pausar' : 'ativar'}</a> · <a data-rx="${i}">excluir</a>` }] : [])], rows, { empty: 'Nenhuma conta fixa cadastrada. Clique em "Nova conta fixa".' })}</div>`;
    $$('[data-re]').forEach(a => a.onclick = () => recModal(rows[+a.dataset.re]));
    $$('[data-rp]').forEach(a => a.onclick = async () => { const x = rows[+a.dataset.rp]; try { await api('/recorrencias/' + x.id, { method: 'PUT', body: { ativo: !x.ativo } }); show().catch(fail); } catch (e) { fail(e); } });
    $$('[data-rx]').forEach(a => a.onclick = async () => { const x = rows[+a.dataset.rx]; if (!(await confirmBox({ title: 'Excluir conta fixa', msg: `Parar de lançar "${x.descricao}" todo mês? As contas já lançadas continuam.`, ok: 'Excluir', danger: true }))) return; try { await api('/recorrencias/' + x.id, { method: 'DELETE' }); show().catch(fail); } catch (e) { fail(e); } });
  }
  const recModal = x => modal({ title: x ? 'Editar conta fixa' : 'Nova conta fixa', html: `<div class="stack">${fld('Tipo', `<select name="tipo"><option value="pagar" ${x?.tipo !== 'receber' ? 'selected' : ''}>A pagar (despesa)</option><option value="receber" ${x?.tipo === 'receber' ? 'selected' : ''}>A receber</option></select>`)}${fld('Descrição *', inp('descricao', x?.descricao || '', 'placeholder="Ex.: Aluguel da loja"'))}
    <div class="grid2">${fld('Valor (R$) *', `<input name="valor" type="number" step="0.01" value="${x?.valor ?? ''}">`)}${fld('Todo dia do mês *', `<input name="dia" type="number" min="1" max="31" value="${x?.dia ?? 5}">`)}</div>${fld('Fornecedor / pessoa', inp('pessoa', x?.pessoa || ''))}<div class="muted small">Em meses mais curtos, o vencimento vai para o último dia do mês.</div></div>`,
    buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => { const b = getForm(m.body); await api(x ? '/recorrencias/' + x.id : '/recorrencias', { method: x ? 'PUT' : 'POST', body: b }); toast('Conta fixa salva', 'ok'); show().catch(fail); } }] });
  if ($('#novo')) $('#novo').onclick = () => {
    if (tab === 'rec') return recModal(null);
    let cli = null;
    modal({ title: 'Novo lançamento', html: `<div class="stack">${fld('Tipo', '<select name="tipo"><option value="receber">A receber</option><option value="pagar">A pagar</option></select>')}${fld('Descrição *', inp('descricao'))}<div class="grid2">${fld('Valor (R$) *', '<input name="valor" type="number" step="0.01">')}${fld('Vencimento', `<input name="vencimento" type="date" value="${todayStr()}">`)}</div>${fld('Fornecedor / pessoa', inp('pessoa'))}<label class="f"><span><input type="checkbox" name="pago"> Já está pago</span></label>${fld('Forma (se pago)', `<select name="forma">${opts(FORMAS, 'pix')}</select>`)}</div>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => { await api('/lancamentos', { method: 'POST', body: { ...getForm(m.body), cliente_id: cli } }); toast('Lançado', 'ok'); show().catch(fail); } }] });
  };
  await show();
}
