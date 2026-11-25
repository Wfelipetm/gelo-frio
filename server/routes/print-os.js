'use strict';
// Impressão da Ordem de Serviço.
//   /print/os/:id               -> via do cliente (com valores)
//   /print/os/:id?via=tecnico   -> folha de serviço para o técnico (sem preços, com espaços para preencher à mão)
const TIPO_OS = { instalacao: 'Instalação', corretiva: 'Manutenção corretiva', preventiva: 'Manutenção preventiva / limpeza', visita: 'Visita técnica', outro: 'Outro' };

const EXTRA_CSS = `
  .urg{display:inline-block;background:#b91c1c;color:#fff;font-weight:700;font-size:10pt;padding:2px 10px;border-radius:4px;letter-spacing:.5px;margin-left:8px}
  .local{border:2px solid #10222f;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:11pt;line-height:1.6}
  .local .end{font-size:14pt;font-weight:700;line-height:1.35}
  .local small{display:block;font-size:8.5pt;color:#46586a;text-transform:uppercase;letter-spacing:.4px}
  .instr{border:1px solid #d6dee6;border-left:5px solid #0b5cab;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11pt;line-height:1.5}
  .lines div{border-bottom:1px solid #9aa8b5;height:8.5mm}
  .hand{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:8px 0 12px;font-size:10.5pt}
  .hand span{display:inline-block;border-bottom:1px solid #6b7c8b;min-width:34mm;height:5mm;vertical-align:bottom}
  .via{font-size:8.5pt;color:#8795a3;text-align:right;margin-bottom:4px}
  .sq{display:inline-block;width:4.2mm;height:4.2mm;border:1.4px solid #10222f;border-radius:1px;vertical-align:-1mm}
  h4{margin:10px 0 4px;font-size:10pt;color:#46586a;text-transform:uppercase;letter-spacing:.4px}`;

module.exports = (r, h) => {
  const { db, esc, fdate, fdt, nl, qtdf, loja, page, guard, can, brl, CHK_ON, CHK_OFF } = h;
  r.get('/os/:id', (req, res) => {
    if (!guard(req, res)) return;
    const o = db.prepare(`SELECT o.*, c.nome cliente, c.doc cliente_doc, c.telefone cliente_tel, c.endereco cliente_end, u.nome tecnico, e.marca eq_marca, e.modelo eq_modelo, e.btus eq_btus, e.serie eq_serie, e.garantia_ate eq_garantia, e.local_instalacao eq_local
      FROM os o JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.tecnico_id LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE o.id=?`).get(+req.params.id);
    if (!o) return res.status(404).send('OS não encontrada');
    if (!can(req.user.role, 'os.gerir') && can(req.user.role, 'os.propria') && o.tecnico_id !== req.user.id) return res.status(403).send('Sem permissão');
    const veValores = can(req.user.role, 'os.valores');
    const viaTecnico = req.query.via === 'tecnico' || !veValores; // quem não vê valores só recebe a folha do técnico
    const itens = db.prepare('SELECT * FROM os_itens WHERE os_id=? ORDER BY id').all(o.id);
    const chk = o.checklist ? JSON.parse(o.checklist) : [];
    const fotos = db.prepare('SELECT id, legenda, mime, data FROM os_fotos WHERE os_id=? ORDER BY id').all(o.id);

    const linhasEnd = [o.atend_endereco || o.cliente_end || 'Endereço não informado', o.atend_bairro, o.atend_complemento].filter(Boolean).join(' · ');
    const eq = o.eq_marca ? `${o.eq_marca} ${o.eq_modelo || ''} ${o.eq_btus ? o.eq_btus + ' BTUs' : ''}${o.eq_local ? ' · ' + o.eq_local : ''}` : '';
    const lines = n => `<div class="lines">${'<div></div>'.repeat(n)}</div>`;

    const cab = `${loja()}<div class="tit"><h2>ORDEM DE SERVIÇO Nº ${o.numero}${o.prioridade === 'urgente' ? '<span class="urg">URGENTE</span>' : ''}</h2>
      <div>${esc(TIPO_OS[o.tipo] || o.tipo)}</div><div>Aberta em ${fdate(o.created_at)}${o.concluida_em ? ' · concluída em ' + fdate(o.concluida_em) : ''}</div>
      ${o.agendada_para ? `<div><b>Agendada para ${esc(fdt(o.agendada_para.replace('T', ' ')))}</b></div>` : ''}</div></div>`;

    const local = `<div class="local"><small>Local do atendimento</small><div class="end">${esc(linhasEnd)}</div>
      ${o.atend_referencia ? `<div><b>Referência:</b> ${esc(o.atend_referencia)}</div>` : ''}
      <div class="grid" style="margin-top:4px"><div><b>Cliente:</b> ${esc(o.cliente)}</div><div><b>Telefone do cliente:</b> ${esc(o.cliente_tel || '-')}</div>
      <div><b>Quem atende no local:</b> ${esc(o.atend_contato || '-')}</div><div><b>Telefone do contato:</b> ${esc(o.atend_telefone || o.cliente_tel || '-')}</div>
      <div><b>Técnico:</b> ${esc(o.tecnico || '-')}</div><div><b>Equipamento:</b> ${esc(eq || '-')}${o.eq_serie ? ' · série ' + esc(o.eq_serie) : ''}</div></div></div>`;

    const tabela = viaTecnico
      ? `<table><tr><th>Peças e serviços</th><th class="r" style="width:24mm">Qtd</th><th style="width:22mm;text-align:center">Usou?</th></tr>
         ${itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="r">${qtdf(i.qtd)} ${esc(i.unidade || '')}</td><td style="text-align:center"><span class="sq"></span></td></tr>`).join('') || '<tr><td colspan="3" style="color:#8795a3">Nenhum item previsto.</td></tr>'}</table>`
      : `${itens.length ? `<table><tr><th>Peças e serviços</th><th class="r">Qtd</th><th class="r">Unitário</th><th class="r">Total</th></tr>
         ${itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="r">${qtdf(i.qtd)} ${esc(i.unidade || '')}</td><td class="r">${brl(i.unitario)}</td><td class="r">${brl(i.total)}</td></tr>`).join('')}</table>
         <div class="tot"><div class="g"><span>TOTAL</span><span>${brl(o.total)}</span></div></div>` : ''}`;

    const maoLivre = viaTecnico ? `<h4>Peças usadas além das previstas</h4>${lines(2)}
      <div class="hand"><div>Chegada: <span></span> h</div><div>Saída: <span></span> h</div></div>` : '';

    const body = `<div class="via">${viaTecnico ? 'Via do técnico — sem valores' : 'Via do cliente'}</div><style>${EXTRA_CSS}</style>${cab}${local}
      ${o.instrucoes ? `<div class="instr"><b>Instruções para o técnico:</b><br>${nl(o.instrucoes)}</div>` : ''}
      ${o.descricao ? `<div class="box"><b>Defeito relatado / serviço solicitado:</b><br>${nl(o.descricao)}</div>` : ''}
      ${chk.length ? `<h4>Checklist</h4><div class="chk">${chk.map(c => `<div>${c.ok ? CHK_ON : CHK_OFF} ${esc(c.t)}</div>`).join('')}</div>` : ''}
      ${tabela}${maoLivre}
      ${o.laudo ? `<div class="box"><b>Laudo / observações do técnico:</b><br>${nl(o.laudo)}</div>` : (viaTecnico ? `<h4>Laudo / observações do técnico</h4>${lines(4)}` : '')}
      ${fotos.length ? `<h4>Fotos</h4><div class="fotos">${fotos.map(f => `<div><img src="data:${f.mime};base64,${f.data.toString('base64')}"><span>${esc(f.legenda || '')}</span></div>`).join('')}</div>` : ''}
      <div class="ass"><div>${esc(o.tecnico || 'Técnico')}<br>Assinatura do técnico</div><div>${o.assinatura ? `<img src="${esc(o.assinatura)}" style="max-height:50px;display:block;margin:-54px auto 4px">` : ''}${esc(o.assinatura_nome || o.atend_contato || 'Cliente')}<br>Assinatura do cliente</div></div>`;
    res.type('html').send(page(`OS ${o.numero}`, body, req.query.print));
  });
};
