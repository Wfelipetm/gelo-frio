import { icon, $, $$, esc, api, brl, num, fdt, fdate, todayStr, state, table, modal, confirmBox, toast, fail, getForm, fld, inp, debounce, attachPicker, productSearch, productRow, r2, csv } from '../core.js';

export default async function (root, ctx) {
  const tabs = [['produtos', 'Produtos e serviços'], ...(state.can('estoque.gerir') ? [['entrada', 'Entrada de mercadoria']] : []), ['mov', 'Movimentações']];
  let tab = ctx.query.get('tab') || 'produtos';
  ctx.top('Estoque', state.can('estoque.gerir') ? '<button class="btn p" id="novoprod">' + icon('plus') + ' Novo produto</button>' : '');
  root.innerHTML = `<div class="tabs" id="tabs">${tabs.map(([k, v]) => `<div class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${v}</div>`).join('')}</div><div id="tb"></div>`;
  const show = async t => { tab = t; $$('#tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === t)); $('#tb').innerHTML = ''; await ({ produtos, entrada, mov })[t]($('#tb'), ctx); };
  $$('#tabs .tab').forEach(t => t.onclick = () => show(t.dataset.t).catch(fail));
  if ($('#novoprod')) $('#novoprod').onclick = () => produtoModal(null, () => show(tab).catch(fail));
  await show(tab);
}

// ---------------- produtos ----------------
async function produtos(el) {
  let filtro = ''; const custo = state.can('custo.ver'); const gerir = state.can('estoque.gerir');
  el.innerHTML = `<div class="bar"><input class="q" type="search" id="q" placeholder="Descrição, código, código de fábrica ou código de barras"><div class="chips" id="fc">${[['', 'Todos'], ['peca', 'Peças'], ['servico', 'Serviços'], ['baixo', 'Abaixo do mínimo'], ...(gerir ? [['inativos', 'Inativos']] : [])].map(([k, v]) => `<span class="chip ${k === '' ? 'on' : ''}" data-f="${k}">${v}</span>`).join('')}</div>
    ${custo ? '<button class="btn sm" id="exp">Exportar CSV</button>' : ''}</div><div class="card" id="list"></div>`;
  let rows = [];
  const load = async () => {
    const qs = `q=${encodeURIComponent($('#q').value)}&limit=1000${filtro === 'baixo' ? '&baixo=1' : filtro ? '&tipo=' + filtro : ''}`;
    rows = filtro === 'inativos' ? (await api(`/produtos?todos=1&limit=1000&q=${encodeURIComponent($('#q').value)}`)).filter(p => p.ativo === 0) : await api('/produtos?' + qs);
    $('#list').innerHTML = table([
      { h: 'Código', f: p => esc(p.codigo || '') }, { h: 'Descrição', f: p => `<b>${esc(p.descricao)}</b>${p.gas_tipo ? ` <span class="tag t-az">${esc(p.gas_tipo)}</span>` : ''}${p.tipo === 'servico' ? ' <span class="tag t-vd">serviço</span>' : ''}${p.cod_fabricante ? `<div class="muted small">fab. ${esc(p.cod_fabricante)}</div>` : ''}` },
      { h: 'Estoque', cls: 'r', f: p => p.tipo === 'servico' ? '<span class="muted">—</span>' : `<span class="${p.minimo > 0 && p.estoque <= p.minimo ? 'tag t-vm' : ''}">${num(p.estoque)} ${esc(p.unidade)}</span>` },
      { h: 'Mín.', cls: 'r', f: p => p.tipo === 'servico' ? '' : num(p.minimo) }, ...(custo ? [{ h: 'Custo', cls: 'r', f: p => brl(p.custo) }] : []), { h: 'Preço', cls: 'r', f: p => `<b>${brl(p.preco)}</b>` },
      { h: '', cls: 'r nowrap', f: (p, i) => p.ativo === 0 ? `<a data-hist="${i}">histórico</a>${gerir ? ` · <a data-react="${i}">reativar</a>` : ''}` : `<a data-hist="${i}">histórico</a>${gerir ? ` · <a data-edit="${i}">editar</a>${p.tipo === 'peca' && !p.gas_tipo ? ` · <a data-adj="${i}">ajustar</a>` : ''}` : ''}` }], rows, { empty: filtro === 'inativos' ? 'Nenhum produto inativo.' : 'Nenhum produto encontrado.' });
    $$('[data-react]').forEach(a => a.onclick = async () => { const p = rows[+a.dataset.react]; try { await api('/produtos/' + p.id, { method: 'PUT', body: { ...p, ativo: 1 } }); toast('Produto reativado', 'ok'); load().catch(fail); } catch (e) { fail(e); } });
    $$('[data-edit]').forEach(a => a.onclick = () => produtoModal(rows[+a.dataset.edit], load));
    $$('[data-adj]').forEach(a => a.onclick = () => ajusteModal(rows[+a.dataset.adj], load));
    $$('[data-hist]').forEach(a => a.onclick = () => historico(rows[+a.dataset.hist]));
  };
  $$('#fc .chip').forEach(c => c.onclick = () => { filtro = c.dataset.f; $$('#fc .chip').forEach(x => x.classList.toggle('on', x === c)); load().catch(fail); });
  $('#q').oninput = debounce(() => load().catch(fail));
  if ($('#exp')) $('#exp').onclick = () => csv('produtos.csv', [{ h: 'Código', v: p => p.codigo }, { h: 'Descrição', v: p => p.descricao }, { h: 'Código fábrica', v: p => p.cod_fabricante }, { h: 'Un', v: p => p.unidade }, { h: 'Estoque', v: p => p.estoque }, { h: 'Custo', v: p => p.custo }, { h: 'Preço', v: p => p.preco }], rows);
  await load();
}

export function produtoModal(p, onSaved) {
  const x = p || { tipo: 'peca', unidade: 'un', custo: 0, preco: 0, minimo: 0 };
  const margem = Number(state.config.margem_padrao) || 0; const custoVer = state.can('custo.ver');
  modal({ title: p ? 'Editar produto' : 'Novo produto', size: 'wide', html: `<div class="stack">
    <div class="grid3">${fld('Tipo', `<select name="tipo"><option value="peca" ${x.tipo === 'peca' ? 'selected' : ''}>Peça / material</option><option value="servico" ${x.tipo === 'servico' ? 'selected' : ''}>Serviço (sem estoque)</option></select>`)}${fld('Código interno', inp('codigo', x.codigo, 'placeholder="automático"'))}${fld('Unidade', `<select name="unidade">${['un', 'm', 'kg', 'cx', 'pç'].map(u => `<option ${u === x.unidade ? 'selected' : ''}>${u}</option>`).join('')}</select>`)}</div>
    ${fld('Descrição *', inp('descricao', x.descricao))}
    <div class="grid2">${fld('Código de fábrica / fabricante', inp('cod_fabricante', x.cod_fabricante))}${fld('Código de barras (EAN)', inp('ean', x.ean))}</div>
    <div class="grid3">${custoVer ? fld('Custo (R$)', `<input name="custo" type="number" step="0.01" value="${x.custo ?? 0}">`) : ''}${fld('Preço de venda (R$)', `<input name="preco" type="number" step="0.01" value="${x.preco ?? 0}">`)}${fld('Estoque mínimo', `<input name="minimo" type="number" step="any" value="${x.minimo ?? 0}">`)}</div>
    <div id="grp-peca" class="stack"><div class="grid3">${fld('Tipo de gás (se for gás)', inp('gas_tipo', x.gas_tipo, 'placeholder="ex.: R-410A"'))}${fld('Peso do cilindro (kg)', `<input name="cilindro_kg" type="number" step="any" value="${x.cilindro_kg ?? ''}">`)}
      <label class="f" style="justify-content:flex-end"><span><input type="checkbox" name="controla_serie" ${x.controla_serie ? 'checked' : ''}> Controla nº de série (compressor, split…)</span></label></div>
      <div class="muted small">Gás é vendido por <b>kg</b> e o saldo vem dos cilindros cadastrados em "Gás refrigerante".</div></div>
    ${p ? `<label class="f"><span><input type="checkbox" name="ativo" ${p.ativo === 0 ? '' : 'checked'}> Produto ativo</span></label>` : ''}
    ${custoVer && margem ? `<div class="muted small" id="sug"></div>` : ''}</div>`,
  buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => {
    const f = getForm(m.body); if (!custoVer) f.custo = x.custo;
    p ? await api('/produtos/' + p.id, { method: 'PUT', body: f }) : await api('/produtos', { method: 'POST', body: f });
    toast('Produto salvo', 'ok'); onSaved?.(); } }],
  onOpen: m => {
    const tipo = $('[name=tipo]', m.body), g = $('#grp-peca', m.body);
    const upd = () => { g.classList.toggle('hide', tipo.value === 'servico'); };
    tipo.onchange = upd; upd();
    const sug = $('#sug', m.body);
    if (sug) { const c = $('[name=custo]', m.body); const upd2 = () => { sug.innerHTML = c.value > 0 ? `Preço sugerido com margem de ${margem}%: <b>${brl(c.value * (1 + margem / 100))}</b> <a id="use">usar</a>` : ''; const u = $('#use', m.body); if (u) u.onclick = () => { $('[name=preco]', m.body).value = r2(c.value * (1 + margem / 100)); }; }; c.oninput = upd2; upd2(); }
  } });
}

function ajusteModal(p, onSaved) {
  modal({ title: `Ajustar estoque · ${p.descricao}`, html: `<div class="alert info small">Estoque atual: <b>${num(p.estoque)} ${esc(p.unidade)}</b>. Use número positivo para entrar e negativo para sair.</div><div class="stack">
    ${fld('Quantidade (+ entra / − sai)', '<input name="qtd" type="number" step="any">')}${fld('Motivo', '<select name="motivo"><option value="ajuste">Ajuste de inventário</option><option value="perda">Perda / avaria</option><option value="devolucao">Devolução ao fornecedor</option></select>')}${fld('Observação', inp('obs'))}</div>`,
  buttons: [{ label: 'Cancelar' }, { label: 'Registrar', cls: 'p', onClick: async m => { const f = getForm(m.body); await api('/estoque/ajuste', { method: 'POST', body: { produto_id: p.id, qtd: f.qtd, motivo: f.motivo, obs: f.obs } }); toast('Estoque ajustado', 'ok'); onSaved?.(); } }] });
}

async function historico(p) {
  const rows = await api('/movimentacoes?produto_id=' + p.id + '&limit=100');
  modal({ title: `Histórico · ${p.descricao}`, size: 'wide', html: movTable(rows), buttons: [{ label: 'Fechar', cls: 'p' }] });
}
const TIPO_MOV = { entrada: ['Entrada', 't-vd'], saida: ['Saída', 't-lj'], ajuste: ['Ajuste', 't-az'], perda: ['Perda', 't-vm'], devolucao: ['Devolução forn.', 't-cz'], estorno: ['Estorno', 't-az'] };
const movTable = rows => table([{ h: 'Data', f: m => fdt(m.created_at) }, ...(rows[0]?.descricao ? [{ h: 'Produto', f: m => esc(m.descricao) }] : []),
  { h: 'Tipo', f: m => `<span class="tag ${(TIPO_MOV[m.tipo] || [])[1] || 't-cz'}">${esc((TIPO_MOV[m.tipo] || [m.tipo])[0])}</span>` }, { h: 'Qtd', cls: 'r', f: m => `<b class="${m.qtd < 0 ? 'dn' : 'up'}">${m.qtd > 0 ? '+' : ''}${num(m.qtd)}</b>` }, { h: 'Saldo', cls: 'r', f: m => num(m.saldo_apos) },
  { h: 'Origem', f: m => esc(m.origem ? `${{ venda: 'Venda', os: 'OS', entrada: 'Entrada NF' }[m.origem] || m.origem}${m.ref_numero ? ' nº ' + m.ref_numero : ''}` : '') + (m.obs ? ` <span class="muted small">${esc(m.obs)}</span>` : '') }, { h: 'Usuário', f: m => esc(m.usuario || '') }], rows, { empty: 'Sem movimentações.' });

async function mov(el) {
  el.innerHTML = '<div class="card" id="list"></div>';
  $('#list').innerHTML = movTable(await api('/movimentacoes?limit=300'));
}

// ---------------- entrada de mercadoria ----------------
async function entrada(el, ctx) {
  const E = { fornecedor: '', nf_numero: '', chave: '', itens: [], parcelas: [], gerarPagar: true };
  const margem = Number(state.config.margem_padrao) || 0;
  el.innerHTML = `<div class="card" id="head"><div class="row" style="align-items:center"><div class="grow"><b>Como você quer lançar a mercadoria?</b><div class="muted small">Importando o XML da nota fiscal o sistema lê todos os itens, vincula aos seus produtos e já cria as contas a pagar.</div></div>
    <label class="btn p" style="cursor:pointer">${icon('upload')} Importar XML da NF-e<input type="file" id="xml" accept=".xml,text/xml" class="hide"></label><button class="btn" id="manual">Entrada manual</button></div></div><div id="form" style="margin-top:16px"></div>
    <div class="card" style="margin-top:16px"><h3>Últimas entradas</h3><div id="hist"></div></div>`;
  const hist = async () => { const r = await api('/estoque/entradas'); $('#hist').innerHTML = table([{ h: 'Data', f: e => fdt(e.created_at) }, { h: 'Fornecedor', f: e => esc(e.fornecedor || '—') }, { h: 'NF', f: e => esc(e.nf_numero || '') }, { h: 'Itens', cls: 'r', f: e => e.itens }, ...(state.can('custo.ver') ? [{ h: 'Total', cls: 'r', f: e => brl(e.total) }] : []), { h: 'Lançado por', f: e => esc(e.usuario || '') }], r, { empty: 'Nenhuma entrada lançada ainda.' }); };
  await hist();

  $('#xml').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const pv = await api('/estoque/nfe/preview', { method: 'POST', body: { xml: await file.text() } });
      Object.assign(E, { fornecedor: pv.fornecedor, nf_numero: pv.nf_numero, chave: pv.chave, parcelas: pv.parcelas, gerarPagar: pv.parcelas.length > 0, jaLancada: pv.ja_lancada, emissao: pv.emissao,
        itens: pv.itens.map(i => ({ produto: i.produto, novo: i.produto ? null : { descricao: i.descricao_nf, cod_fabricante: i.cod_fabricante, ean: i.ean, unidade: i.unidade, minimo: 0, ...(i.gas ? { gas_tipo: i.gas.gas_tipo, cilindro_kg: i.gas.cilindro_kg } : {}) }, descricao_nf: i.descricao_nf, qtd: i.qtd, custo: i.custo, preco: i.produto ? i.produto.preco : i.preco_sugerido, unidade: i.unidade })) });
      draw();
    } catch (err) { fail(err); } finally { e.target.value = ''; }
  };
  $('#manual').onclick = () => { Object.assign(E, { fornecedor: '', nf_numero: '', chave: '', itens: [], parcelas: [], gerarPagar: true, jaLancada: false, semParcela: false }); draw(true); };

  function draw(manual) {
    const f = $('#form');
    const custoTotal = () => r2(E.itens.reduce((s, i) => s + i.qtd * i.custo, 0));
    f.innerHTML = `<div class="card">${E.jaLancada ? '<div class="alert err">Atenção: esta nota (mesma chave de acesso) já foi lançada no estoque. O sistema vai recusar o lançamento duplicado.</div>' : ''}
      <div class="grid3" style="margin-bottom:14px">${fld('Fornecedor', `<input id="forn" value="${esc(E.fornecedor)}">`)}${fld('Nº da nota', `<input id="nf" value="${esc(E.nf_numero)}">`)}<div><div class="muted small b">TOTAL (custo)</div><div class="b" style="font-size:22px" id="ct">${brl(custoTotal())}</div></div></div>
      ${manual ? '<div class="bigsearch" style="margin-bottom:12px"><input id="busca" placeholder="Adicionar produto à entrada…" autocomplete="off"></div>' : ''}
      <div class="tblwrap"><table><thead><tr><th>Produto</th><th>Vínculo no sistema</th><th class="r">Qtd</th><th class="r">Custo unit.</th><th class="r">Preço de venda</th><th></th></tr></thead><tbody>${E.itens.map((i, n) => `<tr>
        <td>${esc(i.descricao_nf || i.produto?.descricao || '')}</td>
        <td>${i.produto ? `<span class="tag t-vd">Vinculado</span> ${esc(i.produto.descricao)}${i.produto.gas_tipo ? ` <span class="muted small">(qtd = nº de cilindros)</span>` : ''}` : `<span class="tag t-lj">Novo produto</span>${i.novo?.gas_tipo ? ` <span class="tag t-az">Gás ${esc(i.novo.gas_tipo)}${i.novo.cilindro_kg ? ' · cilindro ' + num(i.novo.cilindro_kg) + ' kg' : ' · informe o peso do cilindro'}</span>` : ''} <a data-link="${n}">vincular a um existente</a>`}</td>
        <td class="r"><input type="number" step="any" min="0" data-q="${n}" value="${i.qtd}" style="width:80px;text-align:right"></td>
        <td class="r"><input type="number" step="0.01" min="0" data-c="${n}" value="${i.custo}" style="width:96px;text-align:right"></td>
        <td class="r"><input type="number" step="0.01" min="0" data-p="${n}" value="${i.preco}" style="width:96px;text-align:right"></td><td><a data-del="${n}">${icon('x')}</a></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum item.</td></tr>'}</tbody></table></div>
      <div style="margin-top:14px" class="row"><div class="grow"><label class="f"><span><input type="checkbox" id="gp" ${E.gerarPagar ? 'checked' : ''}> Lançar contas a pagar</span></label><div id="parc" style="margin-top:8px"></div></div></div>
      <div class="bar" style="margin:16px 0 0;justify-content:flex-end"><button class="btn" id="cancel">Cancelar</button><button class="btn v lg" id="confirm">${icon('check')} Confirmar entrada no estoque</button></div></div>`;
    const syncAuto = () => { if (E.parcelas.length === 1 && E.parcelas[0].auto) { E.parcelas[0].valor = custoTotal(); const i = $('[data-pv="0"]'); if (i) i.value = E.parcelas[0].valor; } };
    const novos = E.itens.filter(i => !i.produto).length;
    if (novos) f.querySelector('.card').insertAdjacentHTML('afterbegin', `<div class="alert info">${novos} item(ns) ainda não existem no seu cadastro e serão <b>criados como novos produtos</b>. Confira o preço de venda sugerido (margem de ${margem}%).</div>`);
    $('#forn').oninput = e => { E.fornecedor = e.target.value; }; $('#nf').oninput = e => { E.nf_numero = e.target.value; };
    $$('[data-q]').forEach(x => x.oninput = () => { E.itens[+x.dataset.q].qtd = parseFloat(x.value) || 0; $('#ct').textContent = brl(custoTotal()); syncAuto(); });
    $$('[data-c]').forEach(x => x.oninput = () => { E.itens[+x.dataset.c].custo = parseFloat(x.value) || 0; $('#ct').textContent = brl(custoTotal()); syncAuto(); });
    $$('[data-p]').forEach(x => x.oninput = () => { E.itens[+x.dataset.p].preco = parseFloat(x.value) || 0; });
    $$('[data-del]').forEach(x => x.onclick = () => { E.itens.splice(+x.dataset.del, 1); draw(manual); });
    $$('[data-link]').forEach(x => x.onclick = () => vincular(E.itens[+x.dataset.link], () => draw(manual)));
    if (manual) attachPicker($('#busca'), { search: productSearch('&tipo=peca'), render: productRow, onPick: p => { E.itens.push({ produto: p, descricao_nf: '', qtd: 1, custo: p.custo || 0, preco: p.preco, unidade: p.unidade }); draw(manual); } });
    const drawParc = () => {
      // entrada manual: já vem uma parcela do valor total, para daqui a 30 dias (o valor acompanha a quantidade e o custo enquanto não for editado)
      if (manual && E.gerarPagar && !E.parcelas.length && !E.semParcela) E.parcelas.push({ vencimento: todayStr(30), valor: custoTotal(), auto: true });
      if (E.parcelas.length === 1 && E.parcelas[0].auto) E.parcelas[0].valor = custoTotal();
      $('#gp').onchange = e => { E.gerarPagar = e.target.checked; drawParc(); };
      $('#parc').innerHTML = E.gerarPagar ? `${E.parcelas.map((p, n) => `<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center"><span class="muted small" style="width:60px">Parcela ${n + 1}</span><input type="date" data-pd="${n}" value="${esc(p.vencimento)}" style="width:160px"><input type="number" step="0.01" data-pv="${n}" value="${p.valor}" style="width:130px"><a data-pdel="${n}">${icon('x')}</a></div>`).join('')}<a id="addp">${icon('plus')} adicionar parcela</a>` : '';
      $$('[data-pd]').forEach(x => x.onchange = () => { E.parcelas[+x.dataset.pd].vencimento = x.value; }); $$('[data-pv]').forEach(x => x.oninput = () => { E.parcelas[+x.dataset.pv].valor = parseFloat(x.value) || 0; E.parcelas[+x.dataset.pv].auto = false; });
      $$('[data-pdel]').forEach(x => x.onclick = () => { E.parcelas.splice(+x.dataset.pdel, 1); if (!E.parcelas.length) E.semParcela = true; drawParc(); });
      if ($('#addp')) $('#addp').onclick = () => { E.parcelas.push({ vencimento: todayStr(30), valor: E.parcelas.length ? 0 : custoTotal() }); drawParc(); };
    };
    drawParc();
    $('#cancel').onclick = () => { f.innerHTML = ''; };
    $('#confirm').onclick = async () => {
      if (!E.itens.length) return toast('Nenhum item na entrada', 'err');
      const b = $('#confirm'); b.disabled = true;
      try {
        const r = await api('/estoque/entrada', { method: 'POST', body: { fornecedor: E.fornecedor, nf_numero: E.nf_numero, chave: E.chave || undefined, parcelas: E.gerarPagar ? E.parcelas : [],
          itens: E.itens.map(i => i.produto ? { produto_id: i.produto.id, qtd: i.qtd, custo: i.custo, preco: i.preco } : { novo: i.novo, qtd: i.qtd, custo: i.custo, preco: i.preco }) } });
        toast(`Entrada lançada: ${brl(r.total)}`, 'ok'); f.innerHTML = ''; E.itens = []; hist();
      } catch (e) { fail(e); } finally { b.disabled = false; }
    };
  }
}

function vincular(item, done) {
  const m = modal({ title: 'Vincular a um produto existente', html: `<div class="bigsearch"><input id="vq" placeholder="Buscar produto…" autocomplete="off"></div><p class="muted small" style="margin-top:8px">Item da nota: ${esc(item.descricao_nf)}</p>`, buttons: [{ label: 'Cancelar' }] });
  attachPicker($('#vq', m.el), { search: productSearch('&tipo=peca'), render: productRow, onPick: p => { item.produto = p; item.novo = null; if (!(item.preco > 0)) item.preco = p.preco; m.close(); done(); } });
}
