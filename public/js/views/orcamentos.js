import { imprimirCupom, icon, $, $$, esc, api, brl, num, fdate, todayStr, state, table, modal, confirmBox, toast, fail, tag, STATUS_ORC, TIPOS_OS, savePdf, sendWhatsApp, fillMsg, clientePicker, attachPicker, productSearch, productRow, getForm, fld, inp, debounce, opts, FORMAS, r2 } from '../core.js';

export default async function (root, ctx) {
  const [id] = ctx.params;
  if (id) return editor(root, ctx, id === 'novo' ? null : +id);
  ctx.top('Orçamentos', '<a class="btn p" href="#/orcamentos/novo">' + icon('plus') + ' Novo orçamento</a>');
  let status = '';
  root.innerHTML = `<div class="bar"><input class="q" type="search" id="q" placeholder="Nº ou cliente"><div class="chips" id="chips">${[['', 'Todos'], ...Object.entries(STATUS_ORC).map(([k, v]) => [k, v[0]])].map(([k, v]) => `<span class="chip ${k === '' ? 'on' : ''}" data-s="${k}">${v}</span>`).join('')}</div></div><div class="card" id="list"></div>`;
  const load = async () => {
    const rows = await api(`/orcamentos?status=${status}&q=${encodeURIComponent($('#q').value)}`);
    $('#list').innerHTML = table([{ h: 'Nº', f: o => `<b>#${o.numero}</b>` }, { h: 'Data', f: o => fdate(o.created_at) }, { h: 'Cliente', f: o => esc(o.cliente || '—') }, { h: 'Vendedor', f: o => esc(o.vendedor) },
      { h: 'Validade', f: o => fdate(o.validade) }, { h: 'Total', cls: 'r', f: o => `<b>${brl(o.total)}</b>` }, { h: 'Situação', f: o => tag(STATUS_ORC, o.status) }], rows, { click: true, empty: 'Nenhum orçamento encontrado.' });
    $$('#list tr.click').forEach(tr => tr.onclick = () => ctx.go('orcamentos/' + rows[+tr.dataset.i].id));
  };
  $$('#chips .chip').forEach(c => c.onclick = () => { status = c.dataset.s; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === c)); load().catch(fail); });
  $('#q').oninput = debounce(() => load().catch(fail));
  await load();
}

async function editor(root, ctx, id) {
  const podeCusto = state.can('custo.ver');
  let O = { id: null, numero: null, status: 'rascunho', cliente: null, validade: todayStr(Number(state.config.validade_dias) || 10), itens: [], obs: '', descMode: 'val', desc: 0 };
  if (id) {
    const o = await api('/orcamentos/' + id);
    O = { ...O, ...o, cliente: o.cliente_id ? { id: o.cliente_id, nome: o.cliente, telefone: o.cliente_tel } : null, desc: o.desconto, descMode: 'val', itens: o.itens.map(i => ({ ...i })) };
  } else if (ctx.query.get('cliente')) {
    const c = await api('/clientes/' + ctx.query.get('cliente')).catch(() => null); if (c) O.cliente = c;
  }
  const editavel = !id || ['rascunho', 'enviado', 'expirado', 'recusado'].includes(O.status);
  ctx.top(id ? `Orçamento nº ${O.numero}` : 'Novo orçamento', `<a class="btn" href="#/orcamentos">${icon('arrow-left')} Voltar</a>`);

  root.innerHTML = `<div class="row" style="align-items:stretch"><div class="stack grow" style="flex:2;min-width:340px">
    <div class="card"><div class="grid2"><div><div class="muted small b" style="margin-bottom:5px">CLIENTE</div><div id="cli"></div></div>
      <div class="grid2">${fld('Válido até', `<input type="date" id="validade" value="${esc(O.validade)}" ${editavel ? '' : 'disabled'}>`)}<div><div class="muted small b" style="margin-bottom:5px">SITUAÇÃO</div>${tag(STATUS_ORC, O.status)}</div></div></div></div>
    ${editavel ? `<div class="card bigsearch"><input id="busca" placeholder="Adicionar peça ou serviço (descrição, código, código de fábrica)…" autocomplete="off"><div class="bar" style="margin:10px 0 0"><button class="btn sm" id="livre">${icon('plus')} Item livre / deslocamento</button><button class="btn sm" id="btus">${icon('calculator')} Calculadora de BTUs</button></div></div>` : ''}
    <div class="card" id="itens" style="padding:6px 12px"></div>
    <div class="card">${fld('Observações (aparecem no PDF)', `<textarea id="obs" ${editavel ? '' : 'disabled'}>${esc(O.obs)}</textarea>`)}</div></div>
    <div class="stack" style="width:340px;max-width:100%;flex:none"><div class="total"><div class="l">TOTAL DO ORÇAMENTO</div><div class="n" id="tot" style="font-size:34px"></div><div id="sub" style="border-top:1px solid #1d3f62;margin-top:10px;padding-top:8px"></div></div>
      ${editavel ? `<div class="card"><h3>Desconto</h3><div style="display:flex;gap:8px"><input type="number" step="any" min="0" id="desc" value="${O.desc || 0}"><select id="descmode" style="width:90px"><option value="val">R$</option><option value="pct">%</option></select></div></div>` : ''}
      ${podeCusto ? '<div class="card" id="margem"></div>' : ''}
      <div class="card stack" id="acoes" style="gap:8px"></div></div></div>`;

  const cli = clientePicker($('#cli'), { value: O.cliente, onChange: c => { O.cliente = c; } });
  if (!editavel) $('#cli .searchbox input')?.setAttribute('disabled', '');
  const subtotal = () => r2(O.itens.reduce((s, i) => s + i.qtd * i.unitario, 0));
  const descontoVal = () => { const s = subtotal(); return Math.min(r2(O.descMode === 'pct' ? s * (O.desc || 0) / 100 : (O.desc || 0)), s); };
  const total = () => r2(subtotal() - descontoVal());

  const drawItens = () => {
    $('#itens').innerHTML = !O.itens.length ? '<div class="empty">Nenhum item ainda. Busque uma peça ou serviço acima.</div>' :
      `<div class="tblwrap"><table><thead><tr><th>Tipo</th><th>Descrição</th><th class="r">Qtd</th><th class="r">Unitário</th><th class="r">Total</th>${editavel ? '<th></th>' : ''}</tr></thead><tbody>${O.itens.map((i, n) => `<tr>
        <td><span class="tag ${i.tipo === 'peca' ? 't-az' : i.tipo === 'servico' ? 't-vd' : 't-cz'}">${{ peca: 'Peça', servico: 'Serviço', desloc: 'Desloc.' }[i.tipo] || esc(i.tipo)}</span></td>
        <td>${editavel && !i.produto_id ? `<input data-d="${n}" value="${esc(i.descricao)}">` : `<b>${esc(i.descricao)}</b>`}</td>
        <td class="r">${editavel ? `<input type="number" step="any" min="0" data-q="${n}" value="${i.qtd}" style="width:80px;text-align:right">` : num(i.qtd)} <span class="muted small">${esc(i.unidade || '')}</span></td>
        <td class="r">${editavel ? `<input type="number" step="0.01" min="0" data-u="${n}" value="${i.unitario}" style="width:100px;text-align:right">` : brl(i.unitario)}</td>
        <td class="r b" id="lt${n}">${brl(i.qtd * i.unitario)}</td>${editavel ? `<td><a data-del="${n}">${icon('x')}</a></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    $$('[data-q]').forEach(e => e.oninput = () => { const i = O.itens[+e.dataset.q]; i.qtd = parseFloat(e.value) || 0; $('#lt' + e.dataset.q).textContent = brl(i.qtd * i.unitario); calc(); });
    $$('[data-u]').forEach(e => e.oninput = () => { const i = O.itens[+e.dataset.u]; i.unitario = parseFloat(e.value) || 0; $('#lt' + e.dataset.u).textContent = brl(i.qtd * i.unitario); calc(); });
    $$('[data-d]').forEach(e => e.oninput = () => { O.itens[+e.dataset.d].descricao = e.value; });
    $$('[data-del]').forEach(e => e.onclick = () => { O.itens.splice(+e.dataset.del, 1); drawItens(); });
    calc();
  };
  const calc = () => {
    $('#tot').textContent = brl(total()); const d = descontoVal();
    $('#sub').innerHTML = `<div class="ln" style="display:flex;justify-content:space-between;color:#c7d6e6"><span>Subtotal</span><span>${brl(subtotal())}</span></div>${d > 0 ? `<div style="display:flex;justify-content:space-between;color:#c7d6e6"><span>Desconto</span><span>− ${brl(d)}</span></div>` : ''}`;
    if (podeCusto && $('#margem')) {
      const custo = r2(O.itens.reduce((s, i) => s + (i.custo || 0) * i.qtd, 0)); const lucro = r2(total() - custo);
      $('#margem').innerHTML = `<h3>Só para a loja ${icon('lock', 15)}</h3><div style="display:flex;justify-content:space-between;padding:3px 0"><span>Custo total</span><b>${brl(custo)}</b></div><div style="display:flex;justify-content:space-between;padding:3px 0"><span>Lucro estimado</span><b class="${lucro >= 0 ? 'up' : 'dn'}">${brl(lucro)}</b></div><div style="display:flex;justify-content:space-between;padding:3px 0"><span>Margem</span><b class="${lucro >= 0 ? 'up' : 'dn'}">${total() > 0 ? num(lucro / total() * 100, 1) : 0}%</b></div><div class="muted small" style="margin-top:6px">O cliente não vê esses valores no PDF.</div>`;
    }
  };
  const addProd = p => {
    O.itens.push({ tipo: p.tipo === 'servico' ? 'servico' : 'peca', produto_id: p.id, descricao: p.descricao, unidade: p.unidade, qtd: 1, unitario: p.preco, custo: p.custo || 0 });
    drawItens();
  };
  if (editavel) {
    attachPicker($('#busca'), { search: productSearch(), render: productRow, onPick: addProd });
    $('#desc').oninput = e => { O.desc = parseFloat(e.target.value) || 0; calc(); };
    $('#descmode').onchange = e => { O.descMode = e.target.value; calc(); };
    $('#livre').onclick = () => modal({ title: 'Item livre', html: `<div class="stack">${fld('Tipo', `<select name="tipo"><option value="servico">Serviço</option><option value="desloc">Deslocamento</option><option value="peca">Outro / material</option></select>`)}${fld('Descrição *', inp('descricao', '', 'placeholder="Ex.: Deslocamento - Centro"'))}<div class="grid2">${fld('Quantidade', '<input name="qtd" type="number" step="any" value="1">')}${fld('Valor unitário (R$)', '<input name="unitario" type="number" step="0.01">')}</div></div>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Adicionar', cls: 'p', onClick: m => { const f = getForm(m.body); if (!f.descricao.trim() || !(f.qtd > 0)) throw new Error('Informe descrição e quantidade'); O.itens.push({ tipo: f.tipo, produto_id: null, descricao: f.descricao.trim(), unidade: 'un', qtd: f.qtd, unitario: f.unitario || 0, custo: 0 }); drawItens(); } }] });
    $('#btus').onclick = calculadoraBtus;
  }

  const corpo = () => ({ cliente_id: O.cliente?.id || null, validade: $('#validade').value, obs: $('#obs').value,
    ...(O.descMode === 'pct' ? { desconto_pct: O.desc } : { desconto_valor: O.desc }),
    itens: O.itens.map(i => ({ tipo: i.tipo, produto_id: i.produto_id || undefined, descricao: i.descricao, unidade: i.unidade, qtd: i.qtd, unitario: i.unitario, custo: i.custo })) });
  const salvar = async (silencioso) => {
    if (!O.itens.length) throw new Error('Adicione pelo menos um item');
    if (O.id) { await api('/orcamentos/' + O.id, { method: 'PUT', body: corpo() }); }
    else { const r = await api('/orcamentos', { method: 'POST', body: corpo() }); O.id = r.id; O.numero = r.numero; history.replaceState(null, '', '#/orcamentos/' + r.id); ctx.top(`Orçamento nº ${r.numero}`, '<a class="btn" href="#/orcamentos">' + icon('arrow-left') + ' Voltar</a>'); }
    if (!silencioso) toast('Orçamento salvo', 'ok');
  };

  const acoes = $('#acoes');
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.style.justifyContent = 'center'; b.innerHTML = label; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { fail(e); } finally { b.disabled = false; } }; acoes.appendChild(b); return b; };
  if (editavel) btn(icon('save') + ' Salvar orçamento', 'p', () => salvar());
  if (O.id) btn(icon('printer') + ' Cupom', '', async () => { if (editavel) await salvar(true); await imprimirCupom('orcamento', O.id); });
  btn(icon('download') + ' Gerar PDF', '', async () => { if (editavel) await salvar(true); const r = await savePdf(`/print/orcamento/${O.id}`, `Orcamento_${O.numero}.pdf`); if (r?.path) toast('PDF salvo em ' + r.path, 'ok'); });
  btn(icon('message-circle') + ' Enviar no WhatsApp', 'g', async () => {
    if (editavel) await salvar(true);
    if (!O.cliente?.telefone) throw new Error('Cadastre o telefone do cliente para enviar pelo WhatsApp');
    const text = fillMsg(state.config.msg_orcamento, { cliente: O.cliente.nome, numero: O.numero, total: brl(total()), validade: fdate($('#validade').value), loja: state.config.loja_nome });
    await sendWhatsApp({ phone: O.cliente.telefone, text, pdfPath: `/print/orcamento/${O.id}`, pdfName: `Orcamento_${O.numero}.pdf` });
    if (['rascunho'].includes(O.status)) { await api(`/orcamentos/${O.id}/status`, { method: 'POST', body: { status: 'enviado' } }); O.status = 'enviado'; }
  });
  if (id && !['convertido'].includes(O.status)) {
    if (['rascunho', 'enviado', 'expirado'].includes(O.status)) {
      btn(icon('check') + ' Cliente aprovou', 'v', async () => { if (editavel) await salvar(true); await api(`/orcamentos/${O.id}/status`, { method: 'POST', body: { status: 'aprovado' } }); toast('Orçamento aprovado', 'ok'); ctx.reload(); });
      btn(icon('x') + ' Cliente recusou', 'd', async () => { await api(`/orcamentos/${O.id}/status`, { method: 'POST', body: { status: 'recusado' } }); toast('Orçamento marcado como recusado'); ctx.reload(); });
    }
    if (O.status !== 'recusado') btn(icon('arrow-right') + ' Converter em venda / OS', 'p', async () => { if (editavel) await salvar(true); converter(O, ctx); });
  }
  if (O.status === 'convertido') acoes.insertAdjacentHTML('beforeend', `<div class="alert ok small">Este orçamento já foi convertido ${O.venda_id ? `em <a href="#/vendas">venda</a>` : `em <a href="#/os/${O.os_id}">ordem de serviço</a>`}.</div>`);
  drawItens();
}

async function converter(O, ctx) {
  const tecnicos = state.can('os.gerir') ? (await api('/equipe')).filter(u => u.role === 'tecnico') : [];
  const equips = O.cliente ? (await api('/clientes/' + O.cliente.id)).equipamentos : [];
  modal({ title: 'Converter orçamento', html: `<div class="tabs" id="ct"><div class="tab on" data-t="venda">Venda</div>${state.can('os.gerir') ? '<div class="tab" data-t="os">Ordem de serviço</div>' : ''}</div>
    <div id="p-venda" class="stack"><div class="alert info small">As peças saem do estoque e o valor entra no financeiro.</div>${fld('Forma de pagamento', `<select name="forma_pgto">${opts(FORMAS, 'pix')}</select>`)}${fld('Vencimento (fiado/boleto)', `<input type="date" name="vencimento" value="${todayStr(30)}">`)}</div>
    <div id="p-os" class="stack hide"><div class="alert info small">As peças saem do estoque quando o técnico concluir a OS.</div>${!O.cliente ? '<div class="alert warn">Defina o cliente do orçamento para gerar uma OS.</div>' : ''}
      ${fld('Tipo', `<select name="tipo">${opts(TIPOS_OS, 'instalacao')}</select>`)}${fld('Técnico', `<select name="tecnico_id"><option value="">— definir depois —</option>${tecnicos.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select>`)}
      ${fld('Equipamento', `<select name="equipamento_id"><option value="">— nenhum / cadastrar depois —</option>${equips.map(e => `<option value="${e.id}">${esc(`${e.marca || ''} ${e.modelo || ''} ${e.btus || ''} ${e.serie || ''}`)}</option>`).join('')}</select>`)}${fld('Agendar para', '<input type="datetime-local" name="agendada_para">')}</div>`,
  buttons: [{ label: 'Cancelar' }, { label: 'Converter', cls: 'p', onClick: async m => {
    const para = $('#ct .tab.on', m.el).dataset.t; const f = getForm(m.body);
    const body = para === 'venda' ? { para, forma_pgto: f.forma_pgto, vencimento: f.vencimento } : { para, tipo: f.tipo, tecnico_id: +f.tecnico_id || null, equipamento_id: +f.equipamento_id || null, agendada_para: f.agendada_para || null };
    const r = await api(`/orcamentos/${O.id}/converter`, { method: 'POST', body });
    toast(para === 'venda' ? `Venda nº ${r.numero} criada` : `OS nº ${r.numero} criada`, 'ok'); ctx.go(para === 'venda' ? 'vendas' : 'os/' + r.id); } }],
  onOpen: m => $$('#ct .tab', m.el).forEach(t => t.onclick = () => { $$('#ct .tab', m.el).forEach(x => x.classList.toggle('on', x === t)); $('#p-venda', m.el).classList.toggle('hide', t.dataset.t !== 'venda'); $('#p-os', m.el).classList.toggle('hide', t.dataset.t !== 'os'); }) });
}

function calculadoraBtus() {
  modal({ title: 'Calculadora de BTUs', html: `<div class="stack"><div class="grid2">${fld('Área do ambiente (m²)', '<input name="area" type="number" step="any" value="20">')}${fld('Pessoas no ambiente', '<input name="pessoas" type="number" value="2">')}</div>
    <div class="grid2">${fld('Aparelhos eletrônicos', '<input name="eletro" type="number" value="1">')}${fld('Sol direto?', '<select name="sol"><option value="0">Pouco / sombra</option><option value="1">Sol da tarde / muito sol</option></select>')}</div><div id="res" class="alert info"></div></div>`,
  buttons: [{ label: 'Fechar' }], onOpen: m => {
    const calc = () => { const f = getForm(m.body); const btu = (f.area || 0) * (f.sol === '1' ? 800 : 600) + Math.max((f.pessoas || 1) - 1, 0) * 600 + (f.eletro || 0) * 600;
      const sizes = [7500, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000]; const rec = sizes.find(s => s >= btu) || sizes.at(-1);
      $('#res', m.body).innerHTML = `Necessário: <b>${num(Math.round(btu), 0)} BTUs</b><br>Aparelho recomendado: <b style="font-size:18px">${num(rec, 0)} BTUs</b>`; };
    $$('input,select', m.body).forEach(e => e.oninput = calc); calc(); } });
}
