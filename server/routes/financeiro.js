'use strict';
const { can, r2, today, addDays, FORMAS } = require('../services');

module.exports = (r, ctx) => {
  const { db, need, wrap, bad, S } = ctx;
  const like = q => `%${String(q || '').trim()}%`;

  // ---------- lançamentos (contas a receber / pagar) ----------
  r.get('/lancamentos', need('fin.ver'), wrap(req => {
    const where = ['l.cancelado=0']; const a = [];
    if (req.query.tipo) { where.push('l.tipo=?'); a.push(req.query.tipo); }
    if (req.query.situacao === 'abertos') where.push('l.pago=0');
    if (req.query.situacao === 'pagos') where.push('l.pago=1');
    if (req.query.situacao === 'vencidos') where.push(`l.pago=0 AND l.vencimento < date('now','localtime')`);
    if (req.query.de) { where.push('COALESCE(l.pago_em,l.vencimento)>=?'); a.push(req.query.de); }
    if (req.query.ate) { where.push('COALESCE(l.pago_em,l.vencimento)<=?'); a.push(req.query.ate); }
    if (req.query.q) { where.push('(l.descricao LIKE ? OR l.pessoa LIKE ? OR c.nome LIKE ?)'); a.push(like(req.query.q), like(req.query.q), like(req.query.q)); }
    return db.prepare(`SELECT l.*, c.nome cliente FROM lancamentos l LEFT JOIN clientes c ON c.id=l.cliente_id WHERE ${where.join(' AND ')}
      ORDER BY l.pago ASC, l.vencimento ASC, l.id DESC LIMIT 500`).all(...a);
  }));

  r.post('/lancamentos', need('fin.gerir'), wrap(req => {
    const b = req.body;
    if (!['receber', 'pagar'].includes(b.tipo)) throw bad('Tipo inválido');
    if (!String(b.descricao || '').trim()) throw bad('Informe a descrição');
    const id = S.addLancamento({ tipo: b.tipo, descricao: b.descricao.trim(), valor: b.valor, vencimento: b.vencimento, pago: !!b.pago, forma: b.forma || null,
      origem: 'manual', cliente_id: b.cliente_id || null, pessoa: b.pessoa || null, user_id: req.user.id });
    S.log(req.user, 'financeiro.lancar', `${b.tipo} ${b.descricao} ${b.valor}`);
    return { id };
  }));

  r.post('/lancamentos/:id/baixar', need('fin.gerir'), wrap(req => {
    const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(+req.params.id);
    if (!l || l.cancelado) throw bad('Lançamento não encontrado', 404);
    if (l.pago) throw bad('Já está pago');
    const forma = req.body.forma || 'dinheiro';
    if (!FORMAS.includes(forma)) throw bad('Forma de pagamento inválida');
    db.prepare('UPDATE lancamentos SET pago=1, pago_em=?, forma=? WHERE id=?').run(req.body.data || today(), forma, l.id);
    S.log(req.user, 'financeiro.baixar', `${l.descricao} ${l.valor}`);
    return { ok: true };
  }));

  r.delete('/lancamentos/:id', need('fin.gerir'), wrap(req => {
    const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(+req.params.id);
    if (!l) throw bad('Lançamento não encontrado', 404);
    if (l.origem !== 'manual' && l.origem !== 'entrada') throw bad('Lançamentos de vendas/OS são cancelados pela própria venda/OS');
    if (l.pago) throw bad('Lançamento já pago não pode ser excluído');
    db.prepare('UPDATE lancamentos SET cancelado=1 WHERE id=?').run(l.id);
    S.log(req.user, 'financeiro.excluir', l.descricao);
    return { ok: true };
  }));

  // ---------- caixa do dia ----------
  r.get('/caixa', need('fin.ver'), wrap(req => {
    const dia = req.query.data || today();
    const rows = db.prepare(`SELECT l.*, c.nome cliente FROM lancamentos l LEFT JOIN clientes c ON c.id=l.cliente_id WHERE l.cancelado=0 AND l.pago=1 AND l.pago_em=? ORDER BY l.id`).all(dia);
    const soma = (tipo, forma) => r2(rows.filter(x => x.tipo === tipo && (!forma || x.forma === forma)).reduce((s, x) => s + x.valor, 0));
    const porForma = {};
    for (const f of FORMAS) { const e = soma('receber', f), s = soma('pagar', f); if (e || s) porForma[f] = r2(e - s); }
    return { data: dia, entradas: soma('receber'), saidas: soma('pagar'), saldo: r2(soma('receber') - soma('pagar')), porForma, movimentos: rows };
  }));

  // ---------- painel ----------
  r.get('/painel', need(null), wrap(req => {
    const u = req.user; const out = {};
    const vendasOk = can(u.role, 'venda.criar') || can(u.role, 'fin.ver');
    const full = can(u.role, 'venda.cancelar');
    if (vendasOk) {
      const dono = full ? '' : ` AND vendedor_id=${+u.id}`;
      out.vendas_hoje = db.prepare(`SELECT COALESCE(SUM(total-devolvido),0) FROM vendas WHERE status='concluida' AND date(created_at)=date('now','localtime')${dono}`).pluck().get();
      out.os_faturadas_hoje = full ? db.prepare(`SELECT COALESCE(SUM(l.valor),0) FROM lancamentos l WHERE l.origem='os' AND l.tipo='receber' AND l.cancelado=0 AND date(l.created_at)=date('now','localtime')`).pluck().get() : 0;
      out.semana = [];
      for (let i = 6; i >= 0; i--) {
        const d = addDays(today(), -i);
        const v = db.prepare(`SELECT COALESCE(SUM(total-devolvido),0) FROM vendas WHERE status='concluida' AND date(created_at)=?${dono}`).pluck().get(d);
        const o = full ? db.prepare(`SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE origem='os' AND tipo='receber' AND cancelado=0 AND date(created_at)=?`).pluck().get(d) : 0;
        out.semana.push({ data: d, total: r2(v + o) });
      }
      const mes = `date(created_at)>=date('now','localtime','start of month')`;
      out.mes = {
        vendas: db.prepare(`SELECT COALESCE(SUM(total-devolvido),0) t, COUNT(*) n FROM vendas WHERE status='concluida' AND ${mes}${dono}`).get(),
        pecas: db.prepare(`SELECT COALESCE(SUM(vi.total),0) FROM venda_itens vi JOIN vendas v ON v.id=vi.venda_id LEFT JOIN produtos p ON p.id=vi.produto_id WHERE v.status='concluida' AND date(v.created_at)>=date('now','localtime','start of month') AND COALESCE(p.tipo,'servico')='peca'${full ? '' : ` AND v.vendedor_id=${+u.id}`}`).pluck().get(),
        servicos: db.prepare(`SELECT COALESCE(SUM(vi.total),0) FROM venda_itens vi JOIN vendas v ON v.id=vi.venda_id LEFT JOIN produtos p ON p.id=vi.produto_id WHERE v.status='concluida' AND date(v.created_at)>=date('now','localtime','start of month') AND COALESCE(p.tipo,'servico')='servico'${full ? '' : ` AND v.vendedor_id=${+u.id}`}`).pluck().get(),
      };
    }
    if (can(u.role, 'orc.gerir')) {
      db.prepare(`UPDATE orcamentos SET status='expirado' WHERE status IN('rascunho','enviado') AND validade < date('now','localtime')`).run();
      const dono = full ? '' : ` AND o.vendedor_id=${+u.id}`;
      out.orcamentos = {
        aguardando: db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total FROM orcamentos o WHERE status IN('rascunho','enviado')${dono}`).get(),
        lista: db.prepare(`SELECT o.id,o.numero,o.total,o.status,o.validade,c.nome cliente FROM orcamentos o LEFT JOIN clientes c ON c.id=o.cliente_id WHERE o.status IN('rascunho','enviado')${dono} ORDER BY o.id DESC LIMIT 5`).all(),
        taxa: (() => { const t = db.prepare(`SELECT SUM(status IN('aprovado','convertido')) ok, COUNT(*) n FROM orcamentos o WHERE status<>'rascunho' AND date(created_at)>=date('now','localtime','-30 days')${dono}`).get(); return t.n ? Math.round(t.ok / t.n * 100) : null; })(),
      };
    }
    if (can(u.role, 'os.ver')) {
      const dono = !can(u.role, 'os.gerir') && can(u.role, 'os.propria') ? ` AND tecnico_id=${+u.id}` : '';
      out.os = {
        abertas: db.prepare(`SELECT COUNT(*) FROM os WHERE status IN('aberta','agendada','em_andamento')${dono}`).pluck().get(),
        hoje: db.prepare(`SELECT COUNT(*) FROM os WHERE status IN('aberta','agendada','em_andamento') AND date(agendada_para)=date('now','localtime')${dono}`).pluck().get(),
        agenda: db.prepare(`SELECT o.id,o.numero,o.tipo,o.status,o.agendada_para,c.nome cliente FROM os o JOIN clientes c ON c.id=o.cliente_id WHERE o.status IN('aberta','agendada','em_andamento')${dono.replace('tecnico_id', 'o.tecnico_id')} ORDER BY COALESCE(o.agendada_para,'9999') LIMIT 5`).all(),
      };
    }
    if (can(u.role, 'estoque.ver')) {
      out.estoque_baixo = db.prepare(`SELECT id,descricao,estoque,minimo,unidade FROM produtos WHERE ativo=1 AND tipo='peca' AND minimo>0 AND estoque<=minimo ORDER BY (estoque*1.0/minimo) LIMIT 50`).all();
    }
    if (can(u.role, 'fin.ver')) {
      out.contas = {
        receber_vencidas: db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(valor),0) total FROM lancamentos WHERE tipo='receber' AND pago=0 AND cancelado=0 AND vencimento<date('now','localtime')`).get(),
        pagar_semana: db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(valor),0) total FROM lancamentos WHERE tipo='pagar' AND pago=0 AND cancelado=0 AND vencimento<=date('now','localtime','+7 days')`).get(),
      };
    }
    return out;
  }));

  // ---------- relatórios ----------
  const periodo = req => ({ de: req.query.de || addDays(today(), -30), ate: req.query.ate || today() });

  r.get('/relatorios/vendedores', need('rel.ver'), wrap(req => {
    const { de, ate } = periodo(req);
    return db.prepare(`SELECT u.id, u.nome, u.comissao_pct, COUNT(v.id) vendas, COALESCE(SUM(v.total-v.devolvido),0) total,
      ROUND(COALESCE(SUM(v.total-v.devolvido),0)*u.comissao_pct/100,2) comissao
      FROM users u LEFT JOIN vendas v ON v.vendedor_id=u.id AND v.status='concluida' AND date(v.created_at) BETWEEN ? AND ?
      WHERE u.ativo=1 GROUP BY u.id HAVING vendas>0 ORDER BY total DESC`).all(de, ate);
  }));

  r.get('/relatorios/lucro', need('custo.ver'), wrap(req => {
    const { de, ate } = periodo(req);
    return db.prepare(`SELECT COALESCE(vi.produto_id,0) produto_id, vi.descricao, SUM(vi.qtd-vi.qtd_devolvida) qtd,
      ROUND(SUM((vi.qtd-vi.qtd_devolvida)*vi.unitario*(CASE WHEN v.subtotal>0 THEN v.total/v.subtotal ELSE 1 END)),2) receita,
      ROUND(SUM((vi.qtd-vi.qtd_devolvida)*vi.custo),2) custo
      FROM venda_itens vi JOIN vendas v ON v.id=vi.venda_id WHERE v.status='concluida' AND date(v.created_at) BETWEEN ? AND ?
      GROUP BY COALESCE(vi.produto_id,0), vi.descricao ORDER BY receita DESC LIMIT 200`).all(de, ate)
      .map(x => ({ ...x, lucro: r2(x.receita - x.custo) }));
  }));

  r.get('/relatorios/estoque', need('estoque.ver'), wrap(req => {
    const ver = can(req.user.role, 'custo.ver');
    const itens = db.prepare(`SELECT id,codigo,descricao,unidade,estoque,minimo,custo,preco FROM produtos WHERE ativo=1 AND tipo='peca' ORDER BY descricao`).all();
    const valorCusto = r2(itens.reduce((s, p) => s + p.estoque * p.custo, 0));
    const valorVenda = r2(itens.reduce((s, p) => s + p.estoque * p.preco, 0));
    return {
      itens: itens.map(p => ver ? p : (({ custo, ...x }) => x)(p)),
      valor_custo: ver ? valorCusto : null, valor_venda: valorVenda,
      abaixo_minimo: itens.filter(p => p.minimo > 0 && p.estoque <= p.minimo).length,
    };
  }));
};
