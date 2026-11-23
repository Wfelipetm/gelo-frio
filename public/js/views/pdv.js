import { imprimirCupom, impressoraAtiva, icon, $, $$, esc, api, brl, num, state, modal, toast, fail, FORMAS, savePdf, attachPicker, productSearch, productRow, clientePicker, todayStr, r2 } from '../core.js';

export default async function (root, ctx) {
  ctx.top('Nova venda', '<a class="btn" href="#/vendas">Ver vendas</a>');
  const cilindros = state.can('gas.ver') ? await api('/cilindros').catch(() => []) : [];
  const S = { cart: [], cliente: null, descMode: 'pct', desc: 0, forma: 'pix', venc: todayStr(30), recebido: '' };

  root.innerHTML = `<div class="row" style="align-items:stretch"><div class="stack grow" style="flex:2;min-width:340px">
    <div class="card"><div id="cli"></div></div>
    <div class="card bigsearch"><div><input id="busca" placeholder="Buscar por descrição, código interno, código de fábrica ou ler o código de barras…  (F2)" autocomplete="off"></div></div>
    <div class="card" id="cartbox" style="padding:6px 12px"></div></div>
    <div class="stack" style="width:360px;max-width:100%;flex:none">
      <div class="total"><div class="l">TOTAL A PAGAR</div><div class="n" id="tot">R$ 0,00</div><div style="border-top:1px solid #1d3f62;margin-top:10px;padding-top:8px" id="sub"></div></div>
      <div class="card"><h3>Desconto</h3><div style="display:flex;gap:8px"><input type="number" step="any" min="0" id="desc" value="0"><select id="descmode" style="width:90px"><option value="pct">%</option><option value="val">R$</option></select></div></div>
      <div class="card"><h3>Forma de pagamento</h3><div class="pay" id="pay">${Object.entries(FORMAS).map(([k, v]) => `<button type="button" class="btn ${k === S.forma ? 'on' : ''}" data-f="${k}">${v}</button>`).join('')}</div>
        <div id="payx" style="margin-top:12px"></div></div>
      <button class="btn v lg" id="fin" style="justify-content:center">${icon('check')} Finalizar venda (F10)</button>
      ${state.can('orc.gerir') ? '<button class="btn" id="orc" style="justify-content:center">Salvar como orçamento</button>' : ''}
      <button class="btn d sm" id="limpar" style="justify-content:center">Limpar venda</button></div></div>`;

  const cli = clientePicker($('#cli'), { onChange: c => { S.cliente = c; drawPayExtra(); } });
  const subtotal = () => r2(S.cart.reduce((s, i) => s + i.qtd * i.unitario, 0));
  const descontoVal = () => { const s = subtotal(); const d = S.descMode === 'pct' ? s * (S.desc || 0) / 100 : (S.desc || 0); return Math.min(r2(d), s); };
  const total = () => r2(subtotal() - descontoVal());

  const cilOpts = i => cilindros.filter(c => c.gas_tipo === i.p.gas_tipo && c.saldo_kg > 0).map(c => `<option value="${c.id}" ${c.id === i.cilindro_id ? 'selected' : ''}>${esc(c.numero)} · ${num(c.saldo_kg)} kg · ${esc(c.local)}</option>`).join('');
  const pickCil = i => { const ok = cilindros.filter(c => c.gas_tipo === i.p.gas_tipo && c.saldo_kg >= i.qtd).sort((a, b) => (b.local === 'Loja') - (a.local === 'Loja') || a.saldo_kg - b.saldo_kg)[0]; i.cilindro_id = ok?.id || null; };

  const drawCart = () => {
    $('#cartbox').innerHTML = !S.cart.length ? '<div class="empty">O carrinho está vazio. Busque um produto acima para começar.</div>' :
      `<div class="tblwrap"><table><thead><tr><th>#</th><th>Produto</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th><th></th></tr></thead><tbody>${S.cart.map((i, n) => `<tr>
        <td>${n + 1}</td><td><b>${esc(i.p.descricao)}</b><div class="muted small">${i.p.tipo === 'peca' ? `Estoque: ${num(i.p.estoque)} ${esc(i.p.unidade)}` : 'Serviço'}${i.p.cod_fabricante ? ' · fab. ' + esc(i.p.cod_fabricante) : ''}</div>
        ${i.p.gas_tipo ? `<select data-cil="${n}" style="margin-top:4px;max-width:260px"><option value="">Cilindro (automático)</option>${cilOpts(i)}</select>` : ''}</td>
        <td class="r"><input type="number" step="${i.p.unidade === 'un' ? 1 : 'any'}" min="0" value="${i.qtd}" data-q="${n}" style="width:84px;text-align:right"> <span class="muted small">${esc(i.p.unidade)}</span></td>
        <td class="r"><input type="number" step="0.01" min="0" value="${i.unitario}" data-u="${n}" style="width:100px;text-align:right"></td>
        <td class="r b" id="lt${n}">${brl(i.qtd * i.unitario)}</td><td><a data-del="${n}" title="Remover">${icon('x')}</a></td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-q]').forEach(e => e.oninput = () => { const i = S.cart[+e.dataset.q]; i.qtd = parseFloat(e.value) || 0; if (i.p.gas_tipo && !cilindros.some(c => c.id === i.cilindro_id && c.saldo_kg >= i.qtd)) i.cilindro_id = null; $('#lt' + e.dataset.q).textContent = brl(i.qtd * i.unitario); calc(); });
    $$('[data-u]').forEach(e => e.oninput = () => { const i = S.cart[+e.dataset.u]; i.unitario = parseFloat(e.value) || 0; $('#lt' + e.dataset.u).textContent = brl(i.qtd * i.unitario); calc(); });
    $$('[data-cil]').forEach(e => e.onchange = () => { S.cart[+e.dataset.cil].cilindro_id = +e.value || null; });
    $$('[data-del]').forEach(e => e.onclick = () => { S.cart.splice(+e.dataset.del, 1); drawCart(); calc(); });
    calc();
  };
  const calc = () => {
    $('#tot').textContent = brl(total());
    const d = descontoVal();
    $('#sub').innerHTML = `<div style="display:flex;justify-content:space-between;color:#c7d6e6"><span>Subtotal (${S.cart.length} ${S.cart.length === 1 ? 'item' : 'itens'})</span><span>${brl(subtotal())}</span></div>${d > 0 ? `<div style="display:flex;justify-content:space-between;color:#c7d6e6"><span>Desconto</span><span>− ${brl(d)}</span></div>` : ''}`;
    drawPayExtra();
  };
  function drawPayExtra() {
    const el = $('#payx'); if (!el) return;
    if (S.forma === 'dinheiro') {
      const troco = (parseFloat(S.recebido) || 0) - total();
      el.innerHTML = `<label class="f">Valor recebido<input type="number" step="0.01" id="rec" value="${S.recebido}"></label><div class="b" style="margin-top:6px">Troco: <span class="${troco < 0 ? 'dn' : 'up'}">${S.recebido === '' ? '—' : brl(Math.max(troco, 0))}</span></div>`;
      $('#rec').oninput = e => { S.recebido = e.target.value; drawPayExtra(); $('#rec').focus(); const v = $('#rec'); v.setSelectionRange(v.value.length, v.value.length); };
    } else if (S.forma === 'fiado' || S.forma === 'boleto') {
      el.innerHTML = `<label class="f">Vencimento<input type="date" id="venc" value="${S.venc}"></label>${S.cliente ? '' : '<div class="alert warn small" style="margin-top:8px">Selecione o cliente para vender a prazo.</div>'}`;
      $('#venc').onchange = e => { S.venc = e.target.value; };
    } else el.innerHTML = '';
  };

  const add = p => {
    const ex = S.cart.find(i => i.p.id === p.id && !p.gas_tipo);
    if (ex) { ex.qtd += 1; } else { const i = { p, qtd: p.gas_tipo ? 1 : 1, unitario: p.preco, cilindro_id: null }; if (p.gas_tipo) pickCil(i); S.cart.push(i); }
    drawCart(); $('#busca').focus();
  };
  const addByCode = async q => {
    const rows = await api(`/produtos?limit=20&q=${encodeURIComponent(q)}`);
    const low = q.toLowerCase();
    const exact = rows.find(p => [p.ean, p.codigo, p.cod_fabricante].some(x => x && x.toLowerCase() === low)) || (rows.length === 1 ? rows[0] : null);
    if (exact) { $('#busca').value = ''; add(exact); } else toast(rows.length ? 'Vários produtos encontrados: escolha na lista' : 'Produto não encontrado', rows.length ? '' : 'err');
  };
  attachPicker($('#busca'), { search: productSearch(), render: productRow, onPick: add, onEnterEmpty: q => addByCode(q).catch(fail) });

  $('#desc').oninput = e => { S.desc = parseFloat(e.target.value) || 0; calc(); };
  $('#descmode').onchange = e => { S.descMode = e.target.value; calc(); };
  $$('#pay [data-f]').forEach(b => b.onclick = () => { S.forma = b.dataset.f; $$('#pay .btn').forEach(x => x.classList.toggle('on', x === b)); drawPayExtra(); });
  $('#limpar').onclick = () => { S.cart = []; cli.set(null); S.desc = 0; $('#desc').value = 0; drawCart(); };

  const itensBody = () => S.cart.map(i => ({ produto_id: i.p.id, qtd: i.qtd, unitario: i.unitario, cilindro_id: i.cilindro_id || undefined }));
  const finalizar = async () => {
    if (!S.cart.length) return toast('Adicione itens à venda', 'err');
    if (S.cart.some(i => !(i.qtd > 0))) return toast('Há item com quantidade zero', 'err');
    if (['fiado', 'boleto'].includes(S.forma) && !S.cliente) return toast('Selecione o cliente para vender a prazo', 'err');
    $('#fin').disabled = true;
    try {
      const body = { cliente_id: S.cliente?.id, itens: itensBody(), forma_pgto: S.forma, vencimento: S.venc };
      if (S.descMode === 'pct') body.desconto_pct = S.desc; else body.desconto_valor = S.desc;
      const v = await api('/vendas', { method: 'POST', body });
      const troco = S.forma === 'dinheiro' && S.recebido !== '' ? Math.max((parseFloat(S.recebido) || 0) - v.total, 0) : null;
      S.cart = []; cli.set(null); S.desc = 0; S.recebido = ''; $('#desc').value = 0; drawCart();
      modal({ title: `Venda nº ${v.numero} concluída`, html: `<div class="alert ok" style="font-size:16px">Total recebido: <b>${brl(v.total)}</b></div>${troco != null ? `<p style="font-size:18px">Troco: <b>${brl(troco)}</b></p>` : ''}`,
        buttons: [{ label: icon('printer') + ' Cupom', keep: true, onClick: () => imprimirCupom('venda', v.id) }, { label: icon('printer') + ' Recibo', keep: true, onClick: () => savePdf(`/print/venda/${v.id}`, `Venda_${v.numero}.pdf`).then(r => r?.path && toast('PDF salvo: ' + r.path, 'ok')) }, { label: 'Nova venda', cls: 'p', onClick: () => $('#busca').focus() }] });
      if (state.config.impressora_auto === '1' && impressoraAtiva()) imprimirCupom('venda', v.id); // impressão automática do cupom
      api('/cilindros').then(c => { cilindros.splice(0, cilindros.length, ...c); }).catch(() => {});
    } catch (e) { fail(e); } finally { $('#fin').disabled = false; }
  };
  $('#fin').onclick = finalizar;
  if ($('#orc')) $('#orc').onclick = async () => {
    if (!S.cart.length) return toast('Adicione itens primeiro', 'err');
    try { const body = { cliente_id: S.cliente?.id, itens: S.cart.map(i => ({ produto_id: i.p.id, qtd: i.qtd, unitario: i.unitario })) };
      if (S.descMode === 'pct') body.desconto_pct = S.desc; else body.desconto_valor = S.desc;
      const o = await api('/orcamentos', { method: 'POST', body }); ctx.go('orcamentos/' + o.id); } catch (e) { fail(e); }
  };
  const keys = e => {
    if (!ctx.isCurrent()) return document.removeEventListener('keydown', keys);
    if (e.key === 'F10') { e.preventDefault(); finalizar(); } else if (e.key === 'F2') { e.preventDefault(); $('#busca').focus(); }
  };
  document.addEventListener('keydown', keys);
  drawCart(); $('#busca').focus();
}
