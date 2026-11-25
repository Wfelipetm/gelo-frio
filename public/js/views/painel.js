import { icon, $, $$, esc, api, brl, num, fdate, state, tag, STATUS_ORC, STATUS_OS, TIPOS_OS, table, fail, waLink, openExternal, fillMsg, fdt } from '../core.js';

export default async function (root, ctx) {
  ctx.top('Painel', `${state.can('venda.criar') ? '<a class="btn" href="#/orcamentos/novo">' + icon('file-text') + ' Novo orçamento</a><a class="btn p" href="#/pdv">' + icon('plus') + ' Nova venda</a>' : ''}${state.can('os.gerir') ? '<a class="btn" href="#/os/novo">' + icon('wrench') + ' Nova OS</a>' : ''}`);
  const p = await api('/painel');
  const manut = state.can('os.ver') && state.can('cliente.ver') ? await api('/manutencoes/vencendo').catch(() => []) : [];
  const k = [];
  if (p.vendas_hoje !== undefined) k.push(`<div class="card kpi"><div class="ic vd">${icon('receipt', 18)}</div><div class="l">Vendas hoje</div><div class="n">${brl(p.vendas_hoje + (p.os_faturadas_hoje || 0))}</div><div class="d muted">${p.os_faturadas_hoje ? `inclui ${brl(p.os_faturadas_hoje)} de serviços (OS)` : 'balcão'}</div></div>`);
  if (p.orcamentos) k.push(`<div class="card kpi"><div class="ic lj">${icon('file-text', 18)}</div><div class="l">Orçamentos aguardando</div><div class="n">${p.orcamentos.aguardando.n}</div><div class="d warn">${brl(p.orcamentos.aguardando.total)} em negociação</div></div>`);
  if (p.os) k.push(`<div class="card kpi"><div class="ic">${icon('wrench', 18)}</div><div class="l">OS abertas</div><div class="n">${p.os.abertas}</div><div class="d muted">${p.os.hoje} agendada(s) para hoje</div></div>`);
  if (p.estoque_baixo) k.push(`<div class="card kpi"><div class="ic ${p.estoque_baixo.length ? 'vm' : 'cz'}">${icon('package', 18)}</div><div class="l">Itens abaixo do mínimo</div><div class="n ${p.estoque_baixo.length ? 'dn' : ''}">${p.estoque_baixo.length}</div><div class="d ${p.estoque_baixo.length ? 'dn' : 'muted'}">${p.estoque_baixo.length ? 'Repor estoque ' + icon('arrow-right') : 'Tudo em dia'}</div></div>`);
  if (p.contas) k.push(`<div class="card kpi"><div class="ic ${p.contas.receber_vencidas.n ? 'vm' : 'cz'}">${icon('circle-dollar-sign', 18)}</div><div class="l">A receber vencido</div><div class="n ${p.contas.receber_vencidas.n ? 'dn' : ''}">${brl(p.contas.receber_vencidas.total)}</div><div class="d muted">${p.contas.receber_vencidas.n} conta(s) · a pagar em 7 dias: ${brl(p.contas.pagar_semana.total)}</div></div>`);

  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let chart = '';
  if (p.semana) {
    const max = Math.max(...p.semana.map(d => d.total), 1);
    chart = `<div class="card grow" style="flex:1.4"><h3>Faturamento dos últimos 7 dias</h3><div class="chart">${p.semana.map((d, i) => `<div class="${i === 6 ? 'hoje' : ''}" style="height:${Math.max(2, d.total / max * 100)}%" title="${brl(d.total)}"><span>${d.total ? num(Math.round(d.total), 0) : ''}</span></div>`).join('')}</div>
      <div class="chartlbl">${p.semana.map((d, i) => `<span>${i === 6 ? '<b>Hoje</b>' : dias[new Date(d.data + 'T12:00').getDay()]}</span>`).join('')}</div>
      <div class="row" style="margin-top:16px;gap:28px">
        <div><div class="muted small">Peças (mês)</div><div class="b" style="font-size:18px">${brl(p.mes.pecas)}</div></div>
        <div><div class="muted small">Serviços (mês)</div><div class="b" style="font-size:18px">${brl(p.mes.servicos)}</div></div>
        <div><div class="muted small">Ticket médio</div><div class="b" style="font-size:18px">${brl(p.mes.vendas.n ? p.mes.vendas.t / p.mes.vendas.n : 0)}</div></div>
        ${p.orcamentos?.taxa != null ? `<div><div class="muted small">Orçamentos aprovados (30 dias)</div><div class="b" style="font-size:18px">${p.orcamentos.taxa}%</div></div>` : ''}</div></div>`;
  }
  const orc = p.orcamentos ? `<div class="card"><h3>Orçamentos aguardando resposta <small><a href="#/orcamentos">ver todos</a></small></h3>${table([
    { h: 'Nº', f: o => `<a href="#/orcamentos/${o.id}">#${o.numero}</a>` }, { h: 'Cliente', f: o => esc(o.cliente || '—') }, { h: 'Total', cls: 'r', f: o => brl(o.total) }, { h: '', f: o => tag(STATUS_ORC, o.status) }], p.orcamentos.lista, { empty: 'Nenhum orçamento pendente.' })}</div>` : '';
  const est = p.estoque_baixo ? `<div class="card"><h3>Estoque em alerta <small><a href="#/estoque">abrir estoque</a></small></h3>${table([
    { h: 'Produto', f: x => esc(x.descricao) }, { h: 'Estoque', cls: 'r', f: x => `<span class="tag t-vm">${num(x.estoque)} ${esc(x.unidade)}</span>` }, { h: 'Mín.', cls: 'r', f: x => num(x.minimo) }], p.estoque_baixo.slice(0, 6), { empty: 'Nenhum item abaixo do mínimo.' })}</div>` : '';
  const agenda = p.os ? `<div class="card"><h3>${state.can('os.gerir') ? 'Próximas OS' : 'Minha agenda'} <small><a href="#/os">ver todas</a></small></h3>${table([
    { h: 'Quando', f: o => o.agendada_para ? fdt(o.agendada_para.replace('T', ' ')) : '<span class="muted">sem data</span>' }, { h: 'Cliente', f: o => `<a href="#/os/${o.id}">${esc(o.cliente)}</a>` }, { h: 'Tipo', f: o => esc(TIPOS_OS[o.tipo]) }, { h: '', f: o => tag(STATUS_OS, o.status) }], p.os.agenda, { empty: 'Nenhuma OS em aberto.' })}</div>` : '';
  const man = manut.length ? `<div class="card"><h3>${icon('bell')} Manutenção preventiva a oferecer <small>${manut.length} cliente(s)</small></h3>${table([
    { h: 'Cliente', f: m => esc(m.cliente) }, { h: 'Equipamento', f: m => esc(`${m.marca || ''} ${m.btus ? m.btus + ' BTUs' : ''}`) }, { h: 'Último serviço', f: m => fdate(m.ultima) },
    { h: '', f: (m, i) => m.telefone ? `<a class="btn sm g" data-wa="${i}" title="Chamar no WhatsApp" aria-label="Chamar no WhatsApp">${icon('message-circle', 16)}</a>` : '<span class="muted small">sem telefone</span>' }], manut.slice(0, 6))}</div>` : '';

  const h = new Date().getHours(); const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const greet = `<div class="greet"><h2>${saud}, ${esc(String(state.user.nome || '').split(' ')[0])}</h2><p>${esc(hoje.charAt(0).toUpperCase() + hoje.slice(1))} · resumo do seu negócio</p></div>`;
  const dataLocal = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  const vence = p.contas?.proximas?.length ? `<div class="card"><h3>Contas vencidas e dos próximos 7 dias <small><a href="#/financeiro">abrir financeiro</a></small></h3>${table([
    { h: 'Vence', f: c => c.vencimento < dataLocal ? `<span class="tag t-vm">venceu ${fdate(c.vencimento)}</span>` : c.vencimento === dataLocal ? '<span class="tag t-lj">hoje</span>' : fdate(c.vencimento) }, { h: 'Conta', f: c => `${esc(c.descricao)}<div class="muted small">${c.tipo === 'pagar' ? 'a pagar' : 'a receber'}</div>` }, { h: 'Valor', cls: 'r', f: c => `<b class="${c.tipo === 'pagar' ? 'dn' : 'up'}">${brl(c.valor)}</b>` }], p.contas.proximas)}</div>` : '';
  root.innerHTML = `${greet}<div class="kpis">${k.join('')}</div><div class="row">${chart}<div class="stack grow">${orc}${est}${vence}</div></div><div class="row" style="margin-top:16px"><div class="grow">${agenda}</div>${man ? `<div class="grow">${man}</div>` : ''}</div>`;
  $$('[data-wa]', root).forEach(a => a.onclick = () => {
    const m = manut[+a.dataset.wa];
    openExternal(waLink(m.telefone, fillMsg(state.config.msg_manutencao, { cliente: m.cliente, loja: state.config.loja_nome })));
  });
}
