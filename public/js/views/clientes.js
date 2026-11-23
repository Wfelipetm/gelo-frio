import { icon, $, $$, esc, api, brl, fdate, state, table, modal, toast, fail, getForm, fld, inp, debounce, clienteModal, tag, STATUS_OS, STATUS_ORC, waLink, openExternal } from '../core.js';

export default async function (root, ctx) {
  const id = ctx.params[0];
  if (id) return detalhe(root, ctx, +id);
  ctx.top('Clientes', state.can('cliente.gerir') ? '<button class="btn p" id="novo">' + icon('plus') + ' Novo cliente</button>' : '');
  root.innerHTML = '<div class="bar"><input class="q" type="search" id="q" placeholder="Nome, CPF/CNPJ ou telefone"></div><div class="card" id="list"></div>';
  const load = async () => {
    const rows = await api('/clientes?q=' + encodeURIComponent($('#q').value));
    $('#list').innerHTML = table([{ h: 'Nome', f: c => `<a href="#/clientes/${c.id}"><b>${esc(c.nome)}</b></a>` }, { h: 'Telefone', f: c => esc(c.telefone || '') }, { h: 'Documento', f: c => esc(c.doc || '') }, { h: 'Endereço', f: c => esc(c.endereco || '') }], rows, { empty: 'Nenhum cliente.' });
  };
  $('#q').oninput = debounce(() => load().catch(fail));
  if ($('#novo')) $('#novo').onclick = () => clienteModal(null, c => { location.hash = '#/clientes/' + (c?.id || ''); });
  await load();
}

async function detalhe(root, ctx, id) {
  const c = await api('/clientes/' + id); const gerir = state.can('cliente.gerir');
  ctx.top(c.nome, '<a class="btn" href="#/clientes">' + icon('arrow-left') + ' Voltar</a>' + (gerir ? ' <button class="btn" id="ed">Editar</button>' : ''));
  root.innerHTML = `<div class="grid2"><div class="card"><h3>Dados</h3><div class="stack small"><div>${icon('phone')} ${esc(c.telefone || '—')} ${c.telefone ? '<a id="wa">WhatsApp</a>' : ''}</div><div>${icon('mail')} ${esc(c.email || '—')}</div><div>${icon('id-card')} ${esc(c.doc || '—')}</div><div>${icon('map-pin')} ${esc(c.endereco || '—')}</div>${c.obs ? `<div class="muted">${esc(c.obs)}</div>` : ''}</div></div>
    <div class="card"><div class="bar" style="margin:0 0 8px"><h3 class="grow" style="margin:0">Equipamentos</h3>${gerir ? '<button class="btn sm" id="neq">' + icon('plus') + ' Equipamento</button>' : ''}</div>
    ${table([{ h: 'Equipamento', f: e => `<b>${esc([e.marca, e.modelo].filter(Boolean).join(' ') || '—')}</b> ${e.btus ? e.btus + ' BTUs' : ''}<div class="muted small">${esc(e.local_instalacao || '')} ${e.serie ? '· série ' + esc(e.serie) : ''}</div>` }, { h: 'Garantia', f: e => fdate(e.garantia_ate) }, ...(gerir ? [{ h: '', f: (e, i) => `<a data-eq="${i}">editar</a>` }] : [])], c.equipamentos, { empty: 'Nenhum equipamento.' })}</div></div>
    <div class="grid3" style="margin-top:16px"><div class="card"><h3>Ordens de serviço</h3>${table([{ h: 'Nº', f: o => `<a href="#/os/${o.id}">${o.numero}</a>` }, { h: '', f: o => tag(STATUS_OS, o.status) }, { h: '', cls: 'r', f: o => brl(o.total) }], c.os)}</div>
    <div class="card"><h3>Orçamentos</h3>${table([{ h: 'Nº', f: o => `<a href="#/orcamentos/${o.id}">${o.numero}</a>` }, { h: '', f: o => tag(STATUS_ORC, o.status) }, { h: '', cls: 'r', f: o => brl(o.total) }], c.orcamentos)}</div>
    <div class="card"><h3>Compras</h3>${table([{ h: 'Nº', f: v => v.numero }, { h: 'Data', f: v => fdate(v.created_at) }, { h: '', cls: 'r', f: v => brl(v.total) }], c.vendas)}</div></div>`;
  if ($('#ed')) $('#ed').onclick = () => clienteModal(c, () => ctx.reload());
  if ($('#wa')) $('#wa').onclick = () => openExternal(waLink(c.telefone, `Olá ${c.nome.split(' ')[0]}, tudo bem?`));
  const eqForm = e => modal({ title: e ? 'Editar equipamento' : 'Novo equipamento', html: `<div class="stack"><div class="grid2">${fld('Marca', inp('marca', e?.marca))}${fld('Modelo', inp('modelo', e?.modelo))}</div><div class="grid2">${fld('BTUs', `<input name="btus" type="number" value="${e?.btus ?? ''}">`)}${fld('Nº de série', inp('serie', e?.serie))}</div>${fld('Local de instalação', inp('local_instalacao', e?.local_instalacao))}${fld('Garantia até', `<input name="garantia_ate" type="date" value="${e?.garantia_ate || ''}">`)}${fld('Observações', inp('obs', e?.obs))}${e ? '<label class="f"><span><input type="checkbox" name="ativo" checked> Ativo</span></label>' : ''}</div>`,
    buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => { const f = getForm(m.body); e ? await api('/equipamentos/' + e.id, { method: 'PUT', body: f }) : await api('/equipamentos', { method: 'POST', body: { ...f, cliente_id: id } }); toast('Salvo', 'ok'); ctx.reload(); } }] });
  if ($('#neq')) $('#neq').onclick = () => eqForm(null);
  $$('[data-eq]').forEach(a => a.onclick = () => eqForm(c.equipamentos[+a.dataset.eq]));
}
