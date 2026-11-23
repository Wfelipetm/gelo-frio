import { imprimirCupom, icon, $, $$, esc, api, brl, num, fdate, fdt, todayStr, state, table, modal, toast, fail, getForm, fld, inp, opts, tag, TIPOS_OS, STATUS_OS, FORMAS, confirmBox, attachPicker, productSearch, productRow, clientePicker, savePdf, sendWhatsApp, fillMsg, resizeImage, r2, debounce } from '../core.js';

export default async function (root, ctx) {
  const [id] = ctx.params;
  if (id) return editor(root, ctx, id === 'nova' ? null : +id);
  const gerir = state.can('os.gerir');
  ctx.top('Ordens de serviço', gerir ? '<a class="btn p" href="#/os/nova">' + icon('plus') + ' Nova OS</a>' : '');
  let st = 'abertas';
  root.innerHTML = `<div class="bar"><input class="q" type="search" id="q" placeholder="Nº da OS ou cliente"><div class="chips" id="sc">${[['abertas', 'Em aberto'], ['concluida', 'Concluídas'], ['faturada', 'Faturadas'], ['', 'Todas']].map(([k, v]) => `<span class="chip ${k === st ? 'on' : ''}" data-s="${k}">${v}</span>`).join('')}</div></div><div class="card" id="list"></div>`;
  const load = async () => {
    const rows = await api(`/os?${st === 'abertas' ? 'abertas=1' : st ? 'status=' + st : ''}&q=${encodeURIComponent($('#q').value)}`);
    $('#list').innerHTML = table([{ h: 'Nº', f: o => `<a href="#/os/${o.id}"><b>${o.numero}</b></a>` }, { h: 'Cliente', f: o => `<b>${esc(o.cliente)}</b><div class="muted small">${esc([o.eq_marca, o.eq_modelo].filter(Boolean).join(' '))} ${o.eq_btus ? o.eq_btus + ' BTUs' : ''}</div>` },
      { h: 'Tipo', f: o => esc(TIPOS_OS[o.tipo] || o.tipo) }, { h: 'Técnico', f: o => esc(o.tecnico || '—') }, { h: 'Agendada', f: o => fdt(o.agendada_para) }, { h: 'Status', f: o => tag(STATUS_OS, o.status) }, { h: 'Total', cls: 'r', f: o => brl(o.total) }], rows, { empty: 'Nenhuma OS.' });
    $$('#list tbody tr').forEach((tr, i) => { tr.style.cursor = 'pointer'; tr.onclick = e => { if (e.target.tagName !== 'A') location.hash = '#/os/' + rows[i].id; }; });
  };
  $$('#sc .chip').forEach(c => c.onclick = () => { st = c.dataset.s; $$('#sc .chip').forEach(x => x.classList.toggle('on', x === c)); load().catch(fail); });
  $('#q').oninput = debounce(() => load().catch(fail));
  await load();
}

async function editor(root, ctx, id) {
  const gerir = state.can('os.gerir'); const custo = state.can('custo.ver');
  let O = { id: null, cliente: null, equipamento_id: null, tecnico_id: null, tipo: 'corretiva', agendada_para: '', descricao: '', laudo: '', itens: [], checklist: [], fotos: [], status: 'aberta', editavel: true };
  const equipe = await api('/equipe'); let eqs = [];
  if (id) { const o = await api('/os/' + id); O = { ...O, ...o, cliente: { id: o.cliente_id, nome: o.cliente, telefone: o.cliente_tel }, agendada_para: o.agendada_para || '', checklist: o.checklist || [] }; }
  else { const qs = ctx.query; if (qs.get('cliente')) { const c = await api('/clientes/' + qs.get('cliente')); O.cliente = c; } O.checklist = await api('/os/checklist/corretiva'); }
  const ed = O.editavel; const cabEd = ed && gerir;
  ctx.top(id ? `OS nº ${O.numero}` : 'Nova OS', '<a class="btn" href="#/os">' + icon('arrow-left') + ' Voltar</a>');
  root.innerHTML = `<div class="grid2"><div class="card"><div class="stack">${id ? `<div>${tag(STATUS_OS, O.status)}</div>` : ''}<div id="cli"></div>${fld('Equipamento', '<select id="eq" ' + (cabEd ? '' : 'disabled') + '></select>')}
    <div class="grid2">${fld('Tipo', `<select id="tipo" ${cabEd ? '' : 'disabled'}>${opts(TIPOS_OS, O.tipo)}</select>`)}${fld('Técnico', `<select id="tec" ${cabEd ? '' : 'disabled'}><option value="">—</option>${equipe.filter(u => ['tecnico', 'supervisor', 'master'].includes(u.role)).map(u => `<option value="${u.id}" ${u.id === O.tecnico_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>`)}</div>
    ${fld('Agendar para', `<input type="datetime-local" id="ag" value="${esc((O.agendada_para || '').replace(' ', 'T').slice(0, 16))}" ${cabEd ? '' : 'disabled'}>`)}${fld('Defeito / serviço solicitado', `<textarea id="desc" rows="3" ${cabEd ? '' : 'disabled'}>${esc(O.descricao)}</textarea>`)}</div></div>
    <div class="card"><h3>Checklist</h3><div id="ck"></div></div></div>
    <div class="card" style="margin-top:16px"><h3>Peças e serviços</h3>${ed ? '<div class="bigsearch"><input id="busca" placeholder="Adicionar peça, gás ou serviço…" autocomplete="off"></div>' : ''}<div id="itens"></div><div class="r b" style="font-size:18px;padding:8px" id="tot"></div>${ed ? '<div class="muted small">Gás: o cilindro é escolhido automaticamente (prioriza o da loja). Estoque e gás só são baixados ao concluir.</div>' : ''}</div>
    <div class="grid2" style="margin-top:16px"><div class="card"><h3>Laudo do técnico</h3><textarea id="laudo" rows="4" style="width:100%" ${ed ? '' : 'disabled'}>${esc(O.laudo || '')}</textarea></div><div class="card"><h3>Fotos</h3><div id="fotos" class="row" style="flex-wrap:wrap;gap:8px"></div>${id && ed ? `<label class="btn sm" style="cursor:pointer;margin-top:8px">${icon('camera')} Adicionar foto<input type="file" id="ff" accept="image/*" capture="environment" class="hide"></label>` : id ? '' : '<div class="muted small">Salve a OS para anexar fotos.</div>'}</div></div>
    <div class="bar" style="margin-top:16px;justify-content:flex-end" id="acts"></div>`;
  const loadEq = async () => { eqs = O.cliente ? (await api('/clientes/' + O.cliente.id)).equipamentos : []; $('#eq').innerHTML = '<option value="">— sem equipamento —</option>' + eqs.map(e => `<option value="${e.id}" ${e.id === O.equipamento_id ? 'selected' : ''}>${esc([e.marca, e.modelo].filter(Boolean).join(' '))} ${e.btus || ''} ${e.local_instalacao ? '· ' + esc(e.local_instalacao) : ''}</option>`).join(''); };
  const cp = clientePicker($('#cli'), { value: O.cliente, allowNew: cabEd, onChange: c => { O.cliente = c; O.equipamento_id = null; loadEq(); } });
  await loadEq();
  const drawCk = () => { $('#ck').innerHTML = O.checklist.map((c, i) => `<label class="f" style="flex-direction:row;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-ck="${i}" ${c.ok ? 'checked' : ''} ${ed ? '' : 'disabled'}> ${esc(c.t)}</label>`).join(''); $$('[data-ck]').forEach(x => x.onchange = () => { O.checklist[+x.dataset.ck].ok = x.checked; }); };
  drawCk();
  if (cabEd && !id) $('#tipo').onchange = async e => { O.checklist = await api('/os/checklist/' + e.target.value); drawCk(); };
  const total = () => r2(O.itens.reduce((s, i) => s + i.qtd * i.unitario, 0));
  const drawItens = () => {
    $('#itens').innerHTML = O.itens.length ? `<div class="tblwrap"><table><thead><tr><th>Descrição</th><th class="r">Qtd</th><th class="r">Unitário</th><th class="r">Total</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${O.itens.map((i, n) => `<tr><td>${esc(i.descricao)}${i.cilindro ? ` <span class="muted small">cil. ${esc(i.cilindro)}</span>` : ''}</td>
      <td class="r">${ed ? `<input type="number" step="any" min="0" data-q="${n}" value="${i.qtd}" style="width:80px;text-align:right">` : num(i.qtd)}</td><td class="r">${ed ? `<input type="number" step="0.01" data-u="${n}" value="${i.unitario}" style="width:96px;text-align:right">` : brl(i.unitario)}</td><td class="r" id="lt${n}">${brl(i.qtd * i.unitario)}</td>${ed ? `<td><a data-del="${n}">${icon('x')}</a></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum item.</div>';
    $('#tot').textContent = 'Total: ' + brl(total());
    $$('[data-q]').forEach(e => e.oninput = () => { const i = O.itens[+e.dataset.q]; i.qtd = parseFloat(e.value) || 0; $('#lt' + e.dataset.q).textContent = brl(i.qtd * i.unitario); $('#tot').textContent = 'Total: ' + brl(total()); });
    $$('[data-u]').forEach(e => e.oninput = () => { const i = O.itens[+e.dataset.u]; i.unitario = parseFloat(e.value) || 0; $('#lt' + e.dataset.u).textContent = brl(i.qtd * i.unitario); $('#tot').textContent = 'Total: ' + brl(total()); });
    $$('[data-del]').forEach(e => e.onclick = () => { O.itens.splice(+e.dataset.del, 1); drawItens(); });
  };
  drawItens();
  if (ed) attachPicker($('#busca'), { search: productSearch(), render: productRow, onPick: p => { O.itens.push({ tipo: p.tipo === 'servico' ? 'servico' : 'peca', produto_id: p.id, descricao: p.descricao, unidade: p.unidade, qtd: 1, unitario: p.preco, custo: p.custo || 0 }); drawItens(); },
    onEnterEmpty: () => {} });
  const drawFotos = () => { $('#fotos').innerHTML = O.fotos.map(f => `<div style="position:relative"><a href="/api/os/${O.id}/fotos/${f.id}" target="_blank"><img src="/api/os/${O.id}/fotos/${f.id}" style="height:84px;border-radius:8px"></a>${ed ? `<a data-fd="${f.id}" style="position:absolute;top:2px;right:6px;background:#fff;border-radius:50%;padding:0 5px">${icon('x')}</a>` : ''}</div>`).join('') || '<span class="muted small">Sem fotos.</span>';
    $$('[data-fd]').forEach(a => a.onclick = async () => { await api(`/os/${O.id}/fotos/${a.dataset.fd}`, { method: 'DELETE' }).catch(fail); O.fotos = O.fotos.filter(f => f.id != a.dataset.fd); drawFotos(); }); };
  drawFotos();
  if ($('#ff')) $('#ff').onchange = async e => { try { for (const f of e.target.files) { const data = await resizeImage(f); const r = await api(`/os/${O.id}/fotos`, { method: 'POST', body: { data } }); O.fotos.push({ id: r.id }); } drawFotos(); } catch (er) { fail(er); } e.target.value = ''; };

  const corpo = () => ({ cliente_id: O.cliente?.id, equipamento_id: $('#eq').value ? +$('#eq').value : null, tecnico_id: $('#tec').value ? +$('#tec').value : null, tipo: $('#tipo').value, agendada_para: $('#ag').value ? $('#ag').value.replace('T', ' ') : null,
    descricao: $('#desc').value, laudo: $('#laudo').value, checklist: O.checklist, itens: O.itens.map(i => ({ tipo: i.tipo, produto_id: i.produto_id || undefined, descricao: i.descricao, unidade: i.unidade, qtd: i.qtd, unitario: i.unitario, custo: i.custo })) });
  const salvar = async () => {
    if (!O.cliente) throw new Error('Selecione o cliente');
    if (id) { const b = corpo(); if (!b.itens.length) delete b.itens; await api('/os/' + id, { method: 'PUT', body: b }); return id; }
    const r = await api('/os', { method: 'POST', body: { ...corpo(), itens: O.itens.length ? corpo().itens : undefined } }); return r.id;
  };
  const acts = $('#acts'); const btn = (l, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.innerHTML = l; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { fail(e); } finally { b.disabled = false; } }; acts.append(b); };
  if (id) btn(icon('printer') + ' Cupom', '', () => imprimirCupom('os', id));
  if (id) btn(icon('printer') + ' PDF', '', () => savePdf('/print/os/' + id, `OS-${O.numero}.pdf`));
  if (id && O.cliente?.telefone) btn('WhatsApp', '', () => sendWhatsApp({ phone: O.cliente.telefone, text: `Olá ${O.cliente.nome.split(' ')[0]}, segue a OS nº ${O.numero} (${brl(total())}). ${state.config.loja_nome || ''}`, pdfPath: '/print/os/' + id, pdfName: `OS-${O.numero}.pdf` }));
  if (ed) btn(icon('save') + ' Salvar', '', async () => { const nid = await salvar(); toast('OS salva', 'ok'); if (!id) location.hash = '#/os/' + nid; else ctx.reload(); });
  if (id && ed) {
    if (['aberta', 'agendada'].includes(O.status)) btn(icon('play') + ' Iniciar atendimento', '', async () => { await salvar(); await api(`/os/${id}/status`, { method: 'POST', body: { status: 'em_andamento' } }); ctx.reload(); });
    btn(icon('check') + ' Concluir OS', 'v', () => concluir());
    if (gerir) btn('Cancelar OS', 'd', async () => { if (await confirmBox({ msg: 'Cancelar esta OS?', ok: 'Cancelar OS', danger: true })) { await api(`/os/${id}/cancelar`, { method: 'POST' }); ctx.reload(); } });
  }
  if (id && O.status === 'concluida' && gerir) btn(icon('circle-dollar-sign') + ' Faturar', 'v', () => new Promise(res => modal({ title: 'Faturar OS', html: `<p>Total: <b>${brl(O.total)}</b></p><div class="stack">${fld('Forma de pagamento', `<select name="forma_pgto">${opts(FORMAS, 'pix')}</select>`)}${fld('Vencimento (fiado/boleto)', `<input name="vencimento" type="date" value="${todayStr(15)}">`)}</div>`,
    buttons: [{ label: 'Cancelar' }, { label: 'Faturar', cls: 'v', onClick: async m => { await api(`/os/${id}/faturar`, { method: 'POST', body: getForm(m.body) }); toast('OS faturada', 'ok'); ctx.reload(); } }] })));

  function concluir() {
    let drawing = false, empty = true;
    modal({ title: 'Concluir OS', size: 'wide', html: `<div class="alert info small">Ao concluir, o estoque e o gás usados são baixados. Esta ação não pode ser desfeita.</div><div class="stack">${fld('Nome de quem recebeu o serviço', inp('assinatura_nome', O.cliente?.nome))}<div><div class="muted small b">ASSINATURA DO CLIENTE (opcional)</div><canvas id="sig" width="560" height="160" style="border:1px dashed #94a3b8;border-radius:8px;background:#fff;touch-action:none;max-width:100%"></canvas><a id="clr">limpar</a></div></div>`,
      buttons: [{ label: 'Voltar' }, { label: 'Concluir', cls: 'v', onClick: async m => { await salvar(); const f = getForm(m.body); await api(`/os/${id}/concluir`, { method: 'POST', body: { laudo: $('#laudo').value, checklist: O.checklist, assinatura: empty ? null : $('#sig').toDataURL('image/png'), assinatura_nome: f.assinatura_nome } }); toast('OS concluída', 'ok'); ctx.reload(); } }],
      onOpen: m => { const cv = $('#sig', m.body), g = cv.getContext('2d'); g.lineWidth = 2.2; g.lineCap = 'round';
        const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
        cv.onpointerdown = e => { drawing = true; empty = false; g.beginPath(); g.moveTo(...pos(e)); cv.setPointerCapture(e.pointerId); }; cv.onpointermove = e => { if (drawing) { g.lineTo(...pos(e)); g.stroke(); } }; cv.onpointerup = () => { drawing = false; };
        $('#clr', m.body).onclick = () => { g.clearRect(0, 0, cv.width, cv.height); empty = true; }; } });
  }
}
