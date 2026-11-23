import { imprimirCupom, icon, $, $$, esc, api, brl, num, fdt, todayStr, state, table, modal, confirmBox, promptBox, toast, fail, FORMAS, savePdf, getForm, fld, inp, debounce } from '../core.js';

export default async function (root, ctx) {
  ctx.top('Vendas', state.can('venda.criar') ? '<a class="btn p" href="#/pdv">' + icon('plus') + ' Nova venda</a>' : '');
  root.innerHTML = `<div class="bar"><input class="q" type="search" id="q" placeholder="Nº da venda ou cliente"><label class="f" style="flex-direction:row;align-items:center;gap:6px">De <input type="date" id="de" style="width:auto" value="${todayStr(-30)}"></label>
    <label class="f" style="flex-direction:row;align-items:center;gap:6px">até <input type="date" id="ate" style="width:auto" value="${todayStr()}"></label></div><div class="card" id="list"></div>`;
  const load = async () => {
    const rows = await api(`/vendas?de=${$('#de').value}&ate=${$('#ate').value}&q=${encodeURIComponent($('#q').value)}`);
    $('#list').innerHTML = table([
      { h: 'Nº', f: v => `<b>${v.numero}</b>` }, { h: 'Data', f: v => fdt(v.created_at) }, { h: 'Cliente', f: v => esc(v.cliente || 'Consumidor') }, { h: 'Vendedor', f: v => esc(v.vendedor) },
      { h: 'Pagamento', f: v => esc(FORMAS[v.forma_pgto] || v.forma_pgto) }, { h: 'Total', cls: 'r', f: v => `<b>${brl(v.total - v.devolvido)}</b>` },
      { h: '', f: v => v.status === 'cancelada' ? '<span class="tag t-vm">Cancelada</span>' : v.devolvido > 0 ? '<span class="tag t-lj">Devolução parcial</span>' : '' }], rows, { click: true, empty: 'Nenhuma venda no período.' });
    $$('#list tr.click').forEach(tr => tr.onclick = () => detalhe(rows[+tr.dataset.i].id, load));
  };
  ['de', 'ate'].forEach(i => $('#' + i).onchange = () => load().catch(fail));
  $('#q').oninput = debounce(() => load().catch(fail));
  await load();
}

export async function detalhe(id, onChange) {
  const v = await api('/vendas/' + id);
  const sup = state.can('venda.cancelar');
  const m = modal({ title: `Venda nº ${v.numero}${v.status === 'cancelada' ? ' (cancelada)' : ''}`, size: 'wide', html: `
    <div class="grid3" style="margin-bottom:12px"><div><div class="muted small">Cliente</div>${esc(v.cliente || 'Consumidor')}</div><div><div class="muted small">Data</div>${fdt(v.created_at)}</div><div><div class="muted small">Vendedor · pagamento</div>${esc(v.vendedor)} · ${esc(FORMAS[v.forma_pgto] || v.forma_pgto)}</div></div>
    ${v.status === 'cancelada' ? `<div class="alert err">Cancelada em ${fdt(v.cancelada_em)}: ${esc(v.cancelada_motivo)}</div>` : ''}
    ${table([{ h: 'Item', f: i => esc(i.descricao) }, { h: 'Qtd', cls: 'r', f: i => `${num(i.qtd)} ${esc(i.unidade || '')}${i.qtd_devolvida ? ` <span class="tag t-lj">dev. ${num(i.qtd_devolvida)}</span>` : ''}` }, { h: 'Unit.', cls: 'r', f: i => brl(i.unitario) }, { h: 'Total', cls: 'r', f: i => brl(i.total) }], v.itens)}
    <div class="r" style="margin-top:10px">${v.desconto > 0 ? `<div class="muted">Desconto: − ${brl(v.desconto)}</div>` : ''}${v.devolvido > 0 ? `<div class="muted">Devolvido: − ${brl(v.devolvido)}</div>` : ''}<div class="b" style="font-size:20px">Total: ${brl(v.total - v.devolvido)}</div></div>`,
  buttons: [
    { label: icon('printer') + ' Cupom', keep: true, onClick: () => imprimirCupom('venda', id) },
    { label: icon('printer') + ' Recibo', keep: true, onClick: () => savePdf(`/print/venda/${id}`, `Venda_${v.numero}.pdf`).then(r => r?.path && toast('PDF salvo: ' + r.path, 'ok')) },
    { label: icon('tag') + ' Etiqueta de entrega', keep: true, onClick: () => savePdf(`/print/etiqueta/${id}`, `Etiqueta_venda_${v.numero}.pdf`).then(r => r?.path && toast('PDF salvo: ' + r.path, 'ok')) },
    ...(sup && v.status === 'concluida' ? [
      { label: icon('undo-2') + ' Devolver itens', keep: true, onClick: () => { m.close(); devolver(v, onChange); } },
      { label: 'Cancelar venda', cls: 'd', keep: true, onClick: async () => {
        const motivo = await promptBox({ title: 'Cancelar venda', label: 'Motivo do cancelamento', ok: 'Cancelar venda' });
        if (!motivo) return; await api(`/vendas/${id}/cancelar`, { method: 'POST', body: { motivo } });
        toast('Venda cancelada. Estoque e financeiro foram ajustados.', 'ok'); m.close(); onChange?.(); } }] : []),
    { label: 'Fechar', cls: 'p' }] });
}

function devolver(v, onChange) {
  const m = modal({ title: `Devolver itens · venda ${v.numero}`, size: 'wide', html: `<p class="muted" style="margin-bottom:10px">Informe a quantidade devolvida de cada item. O estoque volta e o valor é estornado no caixa/financeiro.</p>
    ${table([{ h: 'Item', f: i => esc(i.descricao) }, { h: 'Vendido', cls: 'r', f: i => num(i.qtd - i.qtd_devolvida) }, { h: 'Devolver', cls: 'r', f: i => `<input type="number" step="any" min="0" max="${i.qtd - i.qtd_devolvida}" data-item="${i.id}" style="width:100px" value="0">` }], v.itens.filter(i => i.qtd - i.qtd_devolvida > 0))}
    <div style="margin-top:12px">${fld('Motivo *', inp('motivo'))}</div>`,
  buttons: [{ label: 'Cancelar' }, { label: 'Confirmar devolução', cls: 'p', onClick: async c => {
    const itens = $$('[data-item]', c.body).map(i => ({ item_id: +i.dataset.item, qtd: parseFloat(i.value) || 0 })).filter(i => i.qtd > 0);
    const r = await api(`/vendas/${v.id}/devolver`, { method: 'POST', body: { itens, motivo: $('[name=motivo]', c.body).value } });
    toast(`Devolução registrada: ${brl(r.valor)}`, 'ok'); onChange?.(); } }] });
}
