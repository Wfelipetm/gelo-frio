import { icon, $, $$, esc, api, num, fdt, state, table, modal, toast, fail, getForm, fld, inp } from '../core.js';

export default async function (root, ctx) {
  const gerir = state.can('gas.gerir');
  ctx.top('Gás refrigerante', gerir ? '<button class="btn p" id="novo">' + icon('plus') + ' Novo cilindro</button>' : '');
  const draw = async () => {
    const [tipos, cil, usos, alertas] = await Promise.all([api('/gas/tipos'), api('/cilindros'), api('/gas/usos?limit=60'), api('/gas/alertas')]);
    root.innerHTML = `${alertas.length ? `<div class="alert err"><b>${icon('triangle-alert')} Possível vazamento:</b> ${alertas.map(a => `${esc(a.cliente)} — ${esc([a.marca, a.modelo].filter(Boolean).join(' '))} (${a.cargas} cargas, ${num(a.kg)} kg em 12 meses)`).join('; ')}.</div>` : ''}
    <div class="kpis">${tipos.map(t => `<div class="card kpi"><div class="l">${esc(t.gas_tipo)}</div><div class="n ${t.minimo > 0 && t.saldo <= t.minimo ? 'dn' : ''}">${num(t.saldo)} kg</div><div class="muted small">${t.cilindros} cilindro(s)${t.minimo ? ` · mín. ${num(t.minimo)}` : ''}</div></div>`).join('') || '<div class="muted">Cadastre um produto com "tipo de gás" em Estoque para começar.</div>'}</div>
    <div class="card" style="margin-top:16px"><h3>Cilindros</h3>${table([{ h: 'Nº', f: c => `<b>${esc(c.numero)}</b>` }, { h: 'Gás', f: c => esc(c.gas_tipo) }, { h: 'Local', f: c => esc(c.local) },
      { h: 'Saldo', cls: 'r', f: c => `<b>${num(c.saldo_kg)}</b> / ${num(c.capacidade_kg)} kg` }, { h: '', f: c => `<div class="bar2"><i style="width:${Math.min(100, c.saldo_kg / c.capacidade_kg * 100)}%"></i></div>` },
      ...(gerir ? [{ h: '', cls: 'r', f: (c, i) => `<a data-e="${i}">editar</a>` }] : [])], cil, { empty: 'Nenhum cilindro cadastrado.' })}</div>
    <div class="card" style="margin-top:16px"><h3>Últimos usos</h3>${table([{ h: 'Data', f: u => fdt(u.created_at) }, { h: 'Cilindro', f: u => esc(u.cilindro) + ' <span class="muted small">' + esc(u.gas_tipo) + '</span>' },
      { h: 'Kg', cls: 'r', f: u => `<b class="${u.kg < 0 ? 'up' : 'dn'}">${u.kg < 0 ? '+' : '−'}${num(Math.abs(u.kg))}</b>` }, { h: 'Origem', f: u => esc(({ venda: 'Venda', os: 'OS', ajuste: 'Ajuste', entrada: 'Entrada' }[u.origem] || u.origem) + (u.ref_numero ? ' nº ' + u.ref_numero : '')) }, { h: 'Cliente', f: u => esc(u.cliente || '') }, { h: 'Usuário', f: u => esc(u.usuario || '') }], usos, { empty: 'Sem usos ainda.' })}</div>`;
    $$('[data-e]').forEach(a => a.onclick = () => form(cil[+a.dataset.e]));
  };
  const form = c => {
    modal({ title: c ? `Cilindro ${c.numero}` : 'Novo cilindro', html: `<div class="stack">${c ? '' : fld('Tipo de gás *', inp('gas_tipo', '', 'placeholder="R-410A"')) + fld('Nº do cilindro', inp('numero', '', 'placeholder="automático"')) + fld('Capacidade (kg) *', '<input name="capacidade_kg" type="number" step="any">')}
      ${fld(c ? 'Saldo atual (kg)' : 'Saldo inicial (kg) — vazio = cheio', `<input name="saldo_kg" type="number" step="any" value="${c ? c.saldo_kg : ''}">`)}${fld('Local', `<select name="local">${['Loja', 'Depósito', 'Veículo'].map(l => `<option ${(c?.local || 'Depósito') === l ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${c ? '<label class="f"><span><input type="checkbox" name="ativo" ' + (c.ativo ? 'checked' : '') + '> Ativo</span></label><div class="muted small">Ajustar o saldo registra um uso de ajuste.</div>' : ''}</div>`,
    buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => { const f = getForm(m.body); c ? await api('/cilindros/' + c.id, { method: 'PUT', body: f }) : await api('/cilindros', { method: 'POST', body: f }); toast('Salvo', 'ok'); draw().catch(fail); } }] });
  };
  if ($('#novo')) $('#novo').onclick = () => form(null);
  await draw();
}
