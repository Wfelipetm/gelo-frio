'use strict';
// Páginas de impressão (viram PDF pelo Electron ou pelo "Imprimir" do navegador)
const { can, brl } = require('../services');
// Ícones Lucide (ISC) inline para o checklist do PDF
const CHK_ON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>';
const CHK_OFF = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>';

module.exports = (r, ctx) => {
  const { db, S } = ctx;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fdate = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
  const fdt = s => (s ? `${fdate(s)} ${String(s).slice(11, 16)}` : '');
  const nl = s => esc(s).replace(/\n/g, '<br>');
  const qtdf = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

  const CSS = `
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box}body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#10222f;font-size:11pt;margin:0}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0b5cab;padding-bottom:10px;margin-bottom:14px}
  .loja{display:flex;gap:12px;align-items:center}.loja img{max-height:64px;max-width:150px}
  .loja h1{font-size:17pt;margin:0}.loja div{font-size:9.5pt;color:#46586a;line-height:1.4}
  .tit{text-align:right}.tit h2{margin:0;font-size:16pt;color:#0b5cab}.tit div{font-size:10pt;color:#46586a}
  .box{border:1px solid #d6dee6;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10pt;line-height:1.5}
  .box b{color:#10222f}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}
  table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10pt}
  th{background:#eef3f8;text-align:left;padding:6px 8px;font-size:9pt;text-transform:uppercase;letter-spacing:.3px;color:#46586a}
  td{padding:6px 8px;border-bottom:1px solid #e4eaf0;vertical-align:top}.r{text-align:right}
  .tot{margin-left:auto;width:62mm;font-size:10.5pt}.tot div{display:flex;justify-content:space-between;padding:3px 0}
  .tot .g{border-top:2px solid #0b5cab;font-size:14pt;font-weight:700;padding-top:6px;margin-top:4px}
  .obs{font-size:9.5pt;color:#46586a;margin-top:10px;white-space:pre-line}
  .ass{display:flex;gap:30px;margin-top:34px}.ass div{flex:1;border-top:1px solid #6b7c8b;padding-top:4px;font-size:9pt;text-align:center;color:#46586a}
  .foot{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:8.5pt;color:#8795a3}
  .chk{columns:2;font-size:10pt;margin:4px 0 10px}.chk div{margin:2px 0}
  .fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.fotos img{width:100%;height:42mm;object-fit:cover;border-radius:4px}
  .fotos span{font-size:8.5pt;color:#46586a}`;

  const loja = () => {
    const g = k => S.setting(k) || '';
    return `<div class="top"><div class="loja">${g('loja_logo') ? `<img src="${esc(g('loja_logo'))}">` : ''}
      <div><h1>${esc(g('loja_nome'))}</h1><div>${g('loja_doc') ? 'CNPJ/CPF: ' + esc(g('loja_doc')) + '<br>' : ''}${esc(g('loja_telefone'))}${g('loja_endereco') ? '<br>' + esc(g('loja_endereco')) : ''}</div></div></div>`;
  };
  const page = (title, body, auto) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}
    <div class="foot">${esc(S.setting('loja_nome'))}</div>${auto ? '<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>' : ''}</body></html>`;
  const guard = (req, res) => {
    if (!req.user) { res.status(401).type('html').send('<p style="font-family:sans-serif">Faça login no sistema para ver este documento.</p>'); return false; }
    return true;
  };

  // Cupom 80 mm desenhado a partir dos MESMOS bytes ESC/POS que vão para a térmica (pré-visualização / impressora comum)
  r.get('/cupom/:tipo/:id', (req, res) => {
    if (!guard(req, res)) return;
    try {
      const { bytes } = ctx.cupomBytes(req.params.tipo, +req.params.id, req.user);
      const colunas = +S.setting('impressora_colunas') || 48;
      res.type('html').send(require('../escpos').paraHtml(bytes, { colunas, titulo: 'Cupom', auto: !!req.query.print }));
    } catch (e) { res.status(e.status || 500).type('html').send(`<p style="font-family:sans-serif">${esc(e.message)}</p>`); }
  });

  r.get('/orcamento/:id', (req, res) => {
    if (!guard(req, res)) return;
    const o = db.prepare(`SELECT o.*, c.nome cliente, c.doc cliente_doc, c.telefone cliente_tel, c.endereco cliente_end, u.nome vendedor FROM orcamentos o LEFT JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.vendedor_id WHERE o.id=?`).get(+req.params.id);
    if (!o) return res.status(404).send('Orçamento não encontrado');
    if (!can(req.user.role, 'venda.cancelar') && o.vendedor_id !== req.user.id) return res.status(403).send('Sem permissão');
    const itens = db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id=? ORDER BY id').all(o.id);
    const body = `${loja()}<div class="tit"><h2>ORÇAMENTO Nº ${o.numero}</h2><div>Emitido em ${fdate(o.created_at)}</div><div>Válido até <b>${fdate(o.validade)}</b></div></div></div>
      <div class="box"><div class="grid"><div><b>Cliente:</b> ${esc(o.cliente || 'Consumidor')}</div><div><b>CPF/CNPJ:</b> ${esc(o.cliente_doc || '-')}</div>
      <div><b>Telefone:</b> ${esc(o.cliente_tel || '-')}</div><div><b>Vendedor:</b> ${esc(o.vendedor)}</div></div>${o.cliente_end ? `<div><b>Endereço:</b> ${esc(o.cliente_end)}</div>` : ''}</div>
      <table><tr><th>#</th><th>Descrição</th><th class="r">Qtd</th><th class="r">Unitário</th><th class="r">Total</th></tr>
      ${itens.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.descricao)}</td><td class="r">${qtdf(i.qtd)} ${esc(i.unidade || '')}</td><td class="r">${brl(i.unitario)}</td><td class="r">${brl(i.total)}</td></tr>`).join('')}</table>
      <div class="tot"><div><span>Subtotal</span><span>${brl(o.subtotal)}</span></div>${o.desconto > 0 ? `<div><span>Desconto</span><span>- ${brl(o.desconto)}</span></div>` : ''}<div class="g"><span>TOTAL</span><span>${brl(o.total)}</span></div></div>
      ${o.obs ? `<div class="obs"><b>Observações:</b><br>${nl(o.obs)}</div>` : ''}
      <div class="ass"><div>${esc(S.setting('loja_nome'))}</div><div>De acordo (cliente)</div></div>`;
    res.type('html').send(page(`Orçamento ${o.numero}`, body, req.query.print));
  });

  r.get('/venda/:id', (req, res) => {
    if (!guard(req, res)) return;
    const v = db.prepare(`SELECT v.*, c.nome cliente, c.doc cliente_doc, u.nome vendedor FROM vendas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN users u ON u.id=v.vendedor_id WHERE v.id=?`).get(+req.params.id);
    if (!v) return res.status(404).send('Venda não encontrada');
    if (!can(req.user.role, 'venda.cancelar') && v.vendedor_id !== req.user.id) return res.status(403).send('Sem permissão');
    const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id=?').all(v.id);
    const body = `${loja()}<div class="tit"><h2>RECIBO DE VENDA Nº ${v.numero}</h2><div>${fdt(v.created_at)}</div>${v.status === 'cancelada' ? '<div style="color:#c22f2f"><b>CANCELADA</b></div>' : ''}</div></div>
      <div class="box"><div class="grid"><div><b>Cliente:</b> ${esc(v.cliente || 'Consumidor')}</div><div><b>Vendedor:</b> ${esc(v.vendedor)}</div><div><b>Pagamento:</b> ${esc(v.forma_pgto)}</div></div></div>
      <table><tr><th>#</th><th>Descrição</th><th class="r">Qtd</th><th class="r">Unitário</th><th class="r">Total</th></tr>
      ${itens.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.descricao)}</td><td class="r">${qtdf(i.qtd)} ${esc(i.unidade || '')}</td><td class="r">${brl(i.unitario)}</td><td class="r">${brl(i.total)}</td></tr>`).join('')}</table>
      <div class="tot"><div><span>Subtotal</span><span>${brl(v.subtotal)}</span></div>${v.desconto > 0 ? `<div><span>Desconto</span><span>- ${brl(v.desconto)}</span></div>` : ''}<div class="g"><span>TOTAL</span><span>${brl(v.total)}</span></div></div>
      <p class="obs">Documento sem valor fiscal.</p>`;
    res.type('html').send(page(`Venda ${v.numero}`, body, req.query.print));
  });

  r.get('/etiqueta/:id', (req, res) => {
    if (!guard(req, res)) return;
    const v = db.prepare(`SELECT v.numero, c.nome, c.telefone, c.endereco FROM vendas v LEFT JOIN clientes c ON c.id=v.cliente_id WHERE v.id=?`).get(+req.params.id);
    if (!v) return res.status(404).send('Venda não encontrada');
    const body = `<div style="border:3px solid #10222f;border-radius:8px;padding:18px;margin-top:20mm;font-size:16pt;line-height:1.6">
      <div style="font-size:11pt;color:#46586a">ENTREGAR PARA</div><b style="font-size:22pt">${esc(v.nome || 'Cliente')}</b><br>${esc(v.endereco || 'Endereço não informado')}<br>Tel.: ${esc(v.telefone || '-')}
      <div style="margin-top:14px;font-size:11pt;color:#46586a">Remetente: ${esc(S.setting('loja_nome'))} · ${esc(S.setting('loja_telefone'))} · Venda nº ${v.numero}</div></div>`;
    res.type('html').send(page(`Etiqueta venda ${v.numero}`, body, req.query.print));
  });

  const TIPO_OS = { instalacao: 'Instalação', corretiva: 'Manutenção corretiva', preventiva: 'Manutenção preventiva / limpeza', visita: 'Visita técnica', outro: 'Outro' };
  r.get('/os/:id', (req, res) => {
    if (!guard(req, res)) return;
    const o = db.prepare(`SELECT o.*, c.nome cliente, c.doc cliente_doc, c.telefone cliente_tel, c.endereco cliente_end, u.nome tecnico, e.marca eq_marca, e.modelo eq_modelo, e.btus eq_btus, e.serie eq_serie, e.garantia_ate eq_garantia
      FROM os o JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.tecnico_id LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE o.id=?`).get(+req.params.id);
    if (!o) return res.status(404).send('OS não encontrada');
    if (!can(req.user.role, 'os.gerir') && can(req.user.role, 'os.propria') && o.tecnico_id !== req.user.id) return res.status(403).send('Sem permissão');
    const itens = db.prepare('SELECT * FROM os_itens WHERE os_id=? ORDER BY id').all(o.id);
    const chk = o.checklist ? JSON.parse(o.checklist) : [];
    const fotos = db.prepare('SELECT id, legenda, mime, data FROM os_fotos WHERE os_id=? ORDER BY id').all(o.id);
    const body = `${loja()}<div class="tit"><h2>ORDEM DE SERVIÇO Nº ${o.numero}</h2><div>${esc(TIPO_OS[o.tipo] || o.tipo)}</div><div>Aberta em ${fdate(o.created_at)}${o.concluida_em ? ' · concluída em ' + fdate(o.concluida_em) : ''}</div></div></div>
      <div class="box"><div class="grid"><div><b>Cliente:</b> ${esc(o.cliente)}</div><div><b>Telefone:</b> ${esc(o.cliente_tel || '-')}</div>
      <div><b>Endereço:</b> ${esc(o.cliente_end || '-')}</div><div><b>Técnico:</b> ${esc(o.tecnico || '-')}</div>
      <div><b>Equipamento:</b> ${o.eq_marca ? esc(`${o.eq_marca} ${o.eq_modelo || ''} ${o.eq_btus ? o.eq_btus + ' BTUs' : ''}`) : '-'}</div><div><b>Nº de série:</b> ${esc(o.eq_serie || '-')}${o.eq_garantia ? ' · garantia até ' + fdate(o.eq_garantia) : ''}</div></div></div>
      ${o.descricao ? `<div class="box"><b>Solicitação / defeito relatado:</b><br>${nl(o.descricao)}</div>` : ''}
      ${chk.length ? `<b>Checklist</b><div class="chk">${chk.map(c => `<div>${c.ok ? CHK_ON : CHK_OFF} ${esc(c.t)}</div>`).join('')}</div>` : ''}
      ${itens.length ? `<table><tr><th>Peças e serviços</th><th class="r">Qtd</th><th class="r">Unitário</th><th class="r">Total</th></tr>
      ${itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="r">${qtdf(i.qtd)} ${esc(i.unidade || '')}</td><td class="r">${brl(i.unitario)}</td><td class="r">${brl(i.total)}</td></tr>`).join('')}</table>
      <div class="tot"><div class="g"><span>TOTAL</span><span>${brl(o.total)}</span></div></div>` : ''}
      ${o.laudo ? `<div class="box"><b>Laudo / observações do técnico:</b><br>${nl(o.laudo)}</div>` : ''}
      ${fotos.length ? `<b>Fotos</b><div class="fotos">${fotos.map(f => `<div><img src="data:${f.mime};base64,${f.data.toString('base64')}"><span>${esc(f.legenda || '')}</span></div>`).join('')}</div>` : ''}
      <div class="ass"><div>${esc(o.tecnico || 'Técnico')}</div><div>${o.assinatura ? `<img src="${esc(o.assinatura)}" style="max-height:50px;display:block;margin:-54px auto 4px">` : ''}${esc(o.assinatura_nome || 'Cliente')}</div></div>`;
    res.type('html').send(page(`OS ${o.numero}`, body, req.query.print));
  });
};
