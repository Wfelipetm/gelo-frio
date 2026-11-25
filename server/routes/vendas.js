'use strict';
const { can, r2, r3, today, addDays, brl } = require('../services');

module.exports = (r, ctx) => {
  const { db, need, wrap, bad, S } = ctx;
  const like = q => `%${String(q || '').trim()}%`;
  const hideCost = (req, rows) => can(req.user.role, 'custo.ver') ? rows : rows.map(({ custo, ...x }) => x);

  // ================= VENDAS =================
  r.post('/vendas', need('venda.criar'), wrap(req => S.criarVenda(req.user, req.body)));

  r.get('/vendas', need('venda.criar'), wrap(req => {
    const where = ['1=1']; const a = [];
    if (req.query.de) { where.push('date(v.created_at)>=?'); a.push(req.query.de); }
    if (req.query.ate) { where.push('date(v.created_at)<=?'); a.push(req.query.ate); }
    if (req.query.q) { where.push('(CAST(v.numero AS TEXT) LIKE ? OR c.nome LIKE ?)'); a.push(like(req.query.q), like(req.query.q)); }
    // vendedor só enxerga as próprias vendas
    if (!can(req.user.role, 'venda.cancelar')) { where.push('v.vendedor_id=?'); a.push(req.user.id); }
    else if (req.query.vendedor_id) { where.push('v.vendedor_id=?'); a.push(+req.query.vendedor_id); }
    return db.prepare(`SELECT v.*, c.nome cliente, u.nome vendedor FROM vendas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN users u ON u.id=v.vendedor_id
      WHERE ${where.join(' AND ')} ORDER BY v.id DESC LIMIT ?`).all(...a, Math.min(+req.query.limit || 200, 1000));
  }));

  const vendaCompleta = (req, id) => {
    const v = db.prepare(`SELECT v.*, c.nome cliente, c.telefone cliente_tel, u.nome vendedor FROM vendas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN users u ON u.id=v.vendedor_id WHERE v.id=?`).get(id);
    if (!v) throw bad('Venda não encontrada', 404);
    if (!can(req.user.role, 'venda.cancelar') && v.vendedor_id !== req.user.id) throw bad('Sem permissão', 403);
    v.itens = hideCost(req, db.prepare('SELECT * FROM venda_itens WHERE venda_id=?').all(id));
    return v;
  };
  r.get('/vendas/:id', need('venda.criar'), wrap(req => vendaCompleta(req, +req.params.id)));

  const estornar = (user, v, valor, motivo) => {
    const lanc = db.prepare(`SELECT * FROM lancamentos WHERE origem='venda' AND origem_id=? AND tipo='receber' AND cancelado=0 ORDER BY id LIMIT 1`).get(v.id);
    if (!lanc || valor <= 0) return;
    if (lanc.pago) S.addLancamento({ tipo: 'pagar', descricao: `Estorno ${motivo} - venda nº ${v.numero}`, valor, pago: 1, forma: lanc.forma, origem: 'estorno', origem_id: v.id, cliente_id: v.cliente_id, user_id: user.id });
    else if (valor >= lanc.valor - 0.001) db.prepare('UPDATE lancamentos SET cancelado=1 WHERE id=?').run(lanc.id);
    else db.prepare('UPDATE lancamentos SET valor=? WHERE id=?').run(r2(lanc.valor - valor), lanc.id);
  };

  const devolverLinha = (user, v, it, qtd) => {
    if (it.produto_id) {
      const p = S.produto(it.produto_id);
      if (p && p.tipo === 'peca') {
        if (p.gas_tipo) {
          S.devolverGas({ gas_tipo: p.gas_tipo, qtd, origem: 'venda', origem_id: v.id, user_id: user.id });
        } else S.moveStock({ produto_id: p.id, qtd, tipo: 'estorno', custo: p.custo, origem: 'venda', origem_id: v.id, user_id: user.id, allowNegative: true });
      }
    }
    db.prepare('UPDATE venda_itens SET qtd_devolvida=qtd_devolvida+? WHERE id=?').run(qtd, it.id);
  };

  r.post('/vendas/:id/cancelar', need('venda.cancelar'), wrap(req => {
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 3) throw bad('Informe o motivo do cancelamento');
    return db.transaction(() => {
      const v = db.prepare('SELECT * FROM vendas WHERE id=?').get(+req.params.id);
      if (!v) throw bad('Venda não encontrada', 404);
      if (v.status !== 'concluida') throw bad('Esta venda já está cancelada');
      for (const it of db.prepare('SELECT * FROM venda_itens WHERE venda_id=?').all(v.id)) {
        const resta = r3(it.qtd - it.qtd_devolvida);
        if (resta > 0) devolverLinha(req.user, v, it, resta);
      }
      estornar(req.user, v, r2(v.total - v.devolvido), 'cancelamento');
      db.prepare(`UPDATE vendas SET status='cancelada', cancelada_em=datetime('now','localtime'), cancelada_motivo=? WHERE id=?`).run(motivo, v.id);
      S.log(req.user, 'venda.cancelar', `Venda ${v.numero}: ${motivo}`);
      return { ok: true };
    })();
  }));

  // devolução / troca de itens de uma venda já feita
  r.post('/vendas/:id/devolver', need('venda.cancelar'), wrap(req => {
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 3) throw bad('Informe o motivo');
    return db.transaction(() => {
      const v = db.prepare('SELECT * FROM vendas WHERE id=?').get(+req.params.id);
      if (!v || v.status !== 'concluida') throw bad('Venda não encontrada ou cancelada');
      let valor = 0;
      for (const d of req.body.itens || []) {
        const it = db.prepare('SELECT * FROM venda_itens WHERE id=? AND venda_id=?').get(d.item_id, v.id);
        const q = r3(d.qtd);
        if (!it || !(q > 0)) continue;
        if (q > it.qtd - it.qtd_devolvida + 0.0001) throw bad(`Quantidade maior que a vendida em "${it.descricao}"`);
        devolverLinha(req.user, v, it, q);
        valor += q * it.unitario * (v.subtotal ? v.total / v.subtotal : 1);
      }
      valor = r2(valor);
      if (!(valor > 0)) throw bad('Nenhum item selecionado');
      estornar(req.user, v, valor, 'devolução');
      db.prepare('UPDATE vendas SET devolvido=devolvido+? WHERE id=?').run(valor, v.id);
      S.log(req.user, 'venda.devolver', `Venda ${v.numero}: ${brl(valor)} (${motivo})`);
      return { ok: true, valor };
    })();
  }));

  // ================= ORÇAMENTOS =================
  const expirar = () => db.prepare(`UPDATE orcamentos SET status='expirado' WHERE status IN('rascunho','enviado') AND validade < date('now','localtime')`).run();

  r.get('/orcamentos', need('orc.gerir'), wrap(req => {
    expirar();
    const where = ['1=1']; const a = [];
    if (req.query.status) { where.push('o.status=?'); a.push(req.query.status); }
    if (req.query.q) { where.push('(CAST(o.numero AS TEXT) LIKE ? OR c.nome LIKE ?)'); a.push(like(req.query.q), like(req.query.q)); }
    if (!can(req.user.role, 'venda.cancelar')) { where.push('o.vendedor_id=?'); a.push(req.user.id); }
    return db.prepare(`SELECT o.*, c.nome cliente, u.nome vendedor FROM orcamentos o LEFT JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.vendedor_id
      WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 300`).all(...a);
  }));

  const orcCompleto = (req, id) => {
    expirar();
    const o = db.prepare(`SELECT o.*, c.nome cliente, c.telefone cliente_tel, u.nome vendedor FROM orcamentos o LEFT JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.vendedor_id WHERE o.id=?`).get(id);
    if (!o) throw bad('Orçamento não encontrado', 404);
    if (!can(req.user.role, 'venda.cancelar') && o.vendedor_id !== req.user.id) throw bad('Sem permissão', 403);
    o.itens = hideCost(req, db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id=? ORDER BY id').all(id));
    if (can(req.user.role, 'custo.ver')) {
      o.custo_total = r2(o.itens.reduce((s, i) => s + i.custo * i.qtd, 0));
      o.lucro = r2(o.total - o.custo_total);
      o.margem = o.total > 0 ? r2(o.lucro / o.total * 100) : 0;
    }
    return o;
  };
  r.get('/orcamentos/:id', need('orc.gerir'), wrap(req => orcCompleto(req, +req.params.id)));

  const salvarItens = (id, rows) => {
    db.prepare('DELETE FROM orcamento_itens WHERE orcamento_id=?').run(id);
    const ins = db.prepare('INSERT INTO orcamento_itens(orcamento_id,tipo,produto_id,descricao,unidade,qtd,unitario,custo,total) VALUES(?,?,?,?,?,?,?,?,?)');
    rows.forEach(x => ins.run(id, x.tipo, x.produto_id, x.descricao, x.unidade, x.qtd, x.unitario, x.custo, x.total));
  };
  const totais = (rows, b) => {
    const subtotal = r2(rows.reduce((s, x) => s + x.total, 0));
    let desconto = Number(b.desconto_valor) > 0 ? r2(b.desconto_valor) : r2(subtotal * (Number(b.desconto_pct) || 0) / 100);
    if (desconto > subtotal) desconto = subtotal;
    return { subtotal, desconto, total: r2(subtotal - desconto) };
  };

  r.post('/orcamentos', need('orc.gerir'), wrap(req => db.transaction(() => {
    const rows = S.normItens(req.body.itens);
    const t = totais(rows, req.body);
    const numero = S.nextSeq('orcamento');
    const validade = req.body.validade || addDays(today(), Number(S.setting('validade_dias')) || 10);
    const id = db.prepare(`INSERT INTO orcamentos(numero,cliente_id,vendedor_id,validade,subtotal,desconto,total,obs) VALUES(?,?,?,?,?,?,?,?)`)
      .run(numero, req.body.cliente_id || null, req.user.id, validade, t.subtotal, t.desconto, t.total, req.body.obs || null).lastInsertRowid;
    salvarItens(id, rows);
    S.log(req.user, 'orcamento.criar', `Orçamento ${numero} - ${brl(t.total)}`);
    return { id, numero };
  })()));

  r.put('/orcamentos/:id', need('orc.gerir'), wrap(req => db.transaction(() => {
    const o = orcCompleto(req, +req.params.id);
    if (['convertido', 'aprovado'].includes(o.status)) throw bad('Orçamento aprovado/convertido não pode mais ser editado');
    const rows = S.normItens(req.body.itens);
    const t = totais(rows, req.body);
    const validade = req.body.validade || o.validade;
    db.prepare(`UPDATE orcamentos SET cliente_id=?,validade=?,subtotal=?,desconto=?,total=?,obs=?,status=CASE WHEN status='expirado' AND ?>=date('now','localtime') THEN 'rascunho' ELSE status END,updated_at=datetime('now','localtime') WHERE id=?`)
      .run(req.body.cliente_id || null, validade, t.subtotal, t.desconto, t.total, req.body.obs || null, validade, o.id);
    salvarItens(o.id, rows);
    return { ok: true };
  })()));

  r.post('/orcamentos/:id/status', need('orc.gerir'), wrap(req => {
    const o = orcCompleto(req, +req.params.id);
    const st = req.body.status;
    if (!['rascunho', 'enviado', 'aprovado', 'recusado'].includes(st)) throw bad('Status inválido');
    if (o.status === 'convertido') throw bad('Orçamento já foi convertido');
    db.prepare(`UPDATE orcamentos SET status=?, updated_at=datetime('now','localtime') WHERE id=?`).run(st, o.id);
    S.log(req.user, 'orcamento.status', `Orçamento ${o.numero} → ${st}`);
    return { ok: true };
  }));

  r.post('/orcamentos/:id/converter', need('orc.gerir'), wrap(req => db.transaction(() => {
    const o = orcCompleto(req, +req.params.id);
    if (o.status === 'convertido') throw bad('Este orçamento já foi convertido');
    if (o.status === 'recusado') throw bad('Orçamento recusado não pode ser convertido');
    const itens = db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id=?').all(o.id);
    let out;
    if (req.body.para === 'os') {
      if (!o.cliente_id) throw bad('Defina o cliente do orçamento antes de gerar a OS');
      if (!can(req.user.role, 'os.gerir')) throw bad('Sem permissão para criar OS', 403);
      out = ctx.criarOS(req.user, {
        cliente_id: o.cliente_id, equipamento_id: req.body.equipamento_id || null, tecnico_id: req.body.tecnico_id || null,
        tipo: req.body.tipo || 'instalacao', agendada_para: req.body.agendada_para || null, descricao: o.obs || `Gerada do orçamento nº ${o.numero}`,
        orcamento_id: o.id, itens: itens.map(i => ({ ...i })),
      });
      db.prepare(`UPDATE orcamentos SET status='convertido', os_id=?, updated_at=datetime('now','localtime') WHERE id=?`).run(out.id, o.id);
    } else {
      if (!can(req.user.role, 'venda.criar')) throw bad('Sem permissão', 403);
      out = S.criarVenda(req.user, {
        cliente_id: o.cliente_id, itens: itens.map(i => ({ ...i })), desconto_valor: o.desconto,
        forma_pgto: req.body.forma_pgto || 'dinheiro', vencimento: req.body.vencimento, obs: `Orçamento nº ${o.numero}`, orcamento_id: o.id,
      });
      db.prepare(`UPDATE orcamentos SET status='convertido', venda_id=?, updated_at=datetime('now','localtime') WHERE id=?`).run(out.id, o.id);
    }
    S.log(req.user, 'orcamento.converter', `Orçamento ${o.numero} → ${req.body.para === 'os' ? 'OS' : 'venda'}`);
    return out;
  })()));
};
