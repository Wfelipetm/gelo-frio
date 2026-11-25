import { $, esc, api, brl, num, todayStr, state, table, fail, csv } from '../core.js';

export default async function (root, ctx) {
  ctx.top('Relatórios');
  const tabs = [['vend', 'Vendedores e comissão', 'rel.ver'], ['lucro', 'Lucro por produto', 'custo.ver'], ['est', 'Posição de estoque', 'estoque.ver']].filter(t => state.can(t[2]));
  let tab = tabs[0]?.[0]; const d = new Date(); let de = todayStr(-(d.getDate() - 1)), ate = todayStr();
  root.innerHTML = `<div class="bar"><div class="chips" id="tabs">${tabs.map(([k, v]) => `<span class="chip ${k === tab ? 'on' : ''}" data-t="${k}">${v}</span>`).join('')}</div><div class="grow"></div><span id="per"><input type="date" id="de" value="${de}"> até <input type="date" id="ate" value="${ate}"></span><button class="btn sm" id="exp">CSV</button></div><div id="tb"></div>`;
  let cur = { cols: [], rows: [] };
  const load = async () => {
    $('#per').style.display = tab === 'est' ? 'none' : '';
    const q = `?de=${de}&ate=${ate}`; const el = $('#tb');
    if (tab === 'vend') { const rows = await api('/relatorios/vendedores' + q); const t = rows.reduce((s, r) => ({ v: s.v + r.vendas, o: s.o + r.os, t: s.t + r.total, c: s.c + r.comissao }), { v: 0, o: 0, t: 0, c: 0 });
      cur = { cols: [{ h: 'Vendedor', v: r => r.nome }, { h: 'Vendas', v: r => r.vendas }, { h: 'OS faturadas', v: r => r.os }, { h: 'Total', v: r => r.total }, { h: '% comissão', v: r => r.comissao_pct }, { h: 'Comissão', v: r => r.comissao }], rows };
      el.innerHTML = `<div class="card">${table([{ h: 'Vendedor', f: r => `<b>${esc(r.nome)}</b>` }, { h: 'Vendas', cls: 'r', f: r => r.vendas }, { h: 'OS faturadas', cls: 'r', f: r => r.os }, { h: 'Total (vendas + OS)', cls: 'r', f: r => brl(r.total) }, { h: '%', cls: 'r', f: r => num(r.comissao_pct) + '%' }, { h: 'Comissão', cls: 'r', f: r => `<b>${brl(r.comissao)}</b>` }], rows, { empty: 'Sem vendas nem OS faturadas no período.' })}<div class="r b" style="padding:10px">Total: ${t.v} vendas + ${t.o} OS · ${brl(t.t)} · comissões ${brl(t.c)}</div></div>`; }
    if (tab === 'lucro') { const rows = await api('/relatorios/lucro' + q); const t = rows.reduce((s, r) => ({ r: s.r + r.receita, c: s.c + r.custo, l: s.l + r.lucro }), { r: 0, c: 0, l: 0 });
      cur = { cols: [{ h: 'Item', v: r => r.descricao }, { h: 'Qtd', v: r => r.qtd }, { h: 'Receita', v: r => r.receita }, { h: 'Custo', v: r => r.custo }, { h: 'Lucro', v: r => r.lucro }], rows };
      el.innerHTML = `<div class="kpis"><div class="card kpi"><div class="l">Receita</div><div class="n">${brl(t.r)}</div></div><div class="card kpi"><div class="l">Custo</div><div class="n">${brl(t.c)}</div></div><div class="card kpi"><div class="l">Lucro</div><div class="n up">${brl(t.l)}</div></div></div><div class="card" style="margin-top:14px">${table([{ h: 'Item', f: r => esc(r.descricao) }, { h: 'Qtd', cls: 'r', f: r => num(r.qtd) }, { h: 'Receita', cls: 'r', f: r => brl(r.receita) }, { h: 'Custo', cls: 'r', f: r => brl(r.custo) }, { h: 'Lucro', cls: 'r', f: r => `<b class="${r.lucro < 0 ? 'dn' : ''}">${brl(r.lucro)}</b>` }], rows, { empty: 'Sem vendas no período.' })}</div>`; }
    if (tab === 'est') { const r = await api('/relatorios/estoque'); const c = state.can('custo.ver');
      cur = { cols: [{ h: 'Código', v: p => p.codigo }, { h: 'Descrição', v: p => p.descricao }, { h: 'Estoque', v: p => p.estoque }, { h: 'Mínimo', v: p => p.minimo }, ...(c ? [{ h: 'Custo', v: p => p.custo }] : []), { h: 'Preço', v: p => p.preco }], rows: r.itens };
      el.innerHTML = `<div class="kpis">${c ? `<div class="card kpi"><div class="l">Valor a custo</div><div class="n">${brl(r.valor_custo)}</div></div>` : ''}<div class="card kpi"><div class="l">Valor a preço de venda</div><div class="n">${brl(r.valor_venda)}</div></div><div class="card kpi"><div class="l">Abaixo do mínimo</div><div class="n dn">${r.abaixo_minimo}</div></div></div><div class="card" style="margin-top:14px">${table([{ h: 'Descrição', f: p => esc(p.descricao) }, { h: 'Estoque', cls: 'r', f: p => `<span class="${p.minimo > 0 && p.estoque <= p.minimo ? 'tag t-vm' : ''}">${num(p.estoque)} ${esc(p.unidade)}</span>` }, { h: 'Mín.', cls: 'r', f: p => num(p.minimo) }, ...(c ? [{ h: 'Custo', cls: 'r', f: p => brl(p.custo) }] : []), { h: 'Preço', cls: 'r', f: p => brl(p.preco) }], r.itens)}</div>`; }
  };
  root.querySelectorAll('#tabs .chip').forEach(c => c.onclick = () => { tab = c.dataset.t; root.querySelectorAll('#tabs .chip').forEach(x => x.classList.toggle('on', x === c)); load().catch(fail); });
  $('#de').onchange = e => { de = e.target.value; load().catch(fail); }; $('#ate').onchange = e => { ate = e.target.value; load().catch(fail); };
  $('#exp').onclick = () => csv(`relatorio_${tab}.csv`, cur.cols, cur.rows);
  await load();
}
