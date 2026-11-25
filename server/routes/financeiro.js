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

  // ---------- contas recorrentes: lançam sozinhas uma conta por mês ----------
  const pad = n => String(n).padStart(2, '0');
  ctx.gerarRecorrencias = () => {
    const hoje = new Date(); const ym = hoje.getFullYear() + '-' + pad(hoje.getMonth() + 1); const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    let n = 0;
    for (const x of db.prepare('SELECT * FROM recorrencias WHERE ativo=1 AND (ultimo_mes IS NULL OR ultimo_mes<>?)').all(ym)) {
      db.transaction(() => {
        S.addLancamento({ tipo: x.tipo, descricao: x.descricao, valor: x.valor, vencimento: ym + '-' + pad(Math.min(x.dia, ultimoDia)), origem: 'recorrente', origem_id: x.id, pessoa: x.pessoa });
        db.prepare('UPDATE recorrencias SET ultimo_mes=? WHERE id=?').run(ym, x.id); n++;
      })();
    }
    return n;
  };
  const recOk = b => {
    if (!['receber', 'pagar'].includes(b.tipo)) throw bad('Tipo inválido');
    if (!String(b.descricao || '').trim()) throw bad('Informe a descrição');
    if (!(Number(b.valor) > 0)) throw bad('Informe o valor');
    const dia = Math.round(Number(b.dia)); if (!(dia >= 1 && dia <= 31)) throw bad('O dia do mês deve ser de 1 a 31');
    return { tipo: b.tipo, descricao: String(b.descricao).trim(), valor: r2(b.valor), dia, pessoa: String(b.pessoa || '').trim() || null };
  };
  r.get('/recorrencias', need('fin.ver'), wrap(() => db.prepare('SELECT * FROM recorrencias ORDER BY ativo DESC, tipo, descricao').all()));
  r.post('/recorrencias', need('fin.gerir'), wrap(req => {
    const v = recOk(req.body);
    const id = db.prepare('INSERT INTO recorrencias(tipo,descricao,valor,dia,pessoa) VALUES(?,?,?,?,?)').run(v.tipo, v.descricao, v.valor, v.dia, v.pessoa).lastInsertRowid;
    // o dia deste mês já passou: a primeira conta sai só no mês que vem (não nasce "vencida" por criar a conta fixa no meio do mês)
    const agora = new Date();
    if (v.dia < agora.getDate()) db.prepare('UPDATE recorrencias SET ultimo_mes=? WHERE id=?').run(agora.getFullYear() + '-' + pad(agora.getMonth() + 1), id);
    S.log(req.user, 'financeiro.recorrente', v.tipo + ' ' + v.descricao + ' ' + v.valor + ' dia ' + v.dia);
    return { id, geradas: ctx.gerarRecorrencias() };
  }));
  r.put('/recorrencias/:id', need('fin.gerir'), wrap(req => {
    const x = db.prepare('SELECT * FROM recorrencias WHERE id=?').get(+req.params.id); if (!x) throw bad('Conta recorrente não encontrada', 404);
    const v = recOk({ ...x, ...req.body });
    db.prepare('UPDATE recorrencias SET tipo=?, descricao=?, valor=?, dia=?, pessoa=?, ativo=? WHERE id=?').run(v.tipo, v.descricao, v.valor, v.dia, v.pessoa, req.body.ativo === undefined ? x.ativo : (req.body.ativo ? 1 : 0), x.id);
    S.log(req.user, 'financeiro.recorrente', 'alterou ' + v.descricao);
    return { ok: true };
  }));
  r.delete('/recorrencias/:id', need('fin.gerir'), wrap(req => { db.prepare('DELETE FROM recorrencias WHERE id=?').run(+req.params.id); S.log(req.user, 'financeiro.recorrente', 'excluiu ' + req.params.id); return { ok: true }; }));

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
        proximas: db.prepare(`SELECT id, tipo, descricao, valor, vencimento FROM lancamentos WHERE pago=0 AND cancelado=0 AND vencimento<=date('now','localtime','+7 days') ORDER BY vencimento, id LIMIT 8`).all(),
      };
    }
    return out;
  }));

  // ---------- relatórios ----------
  const periodo = req => ({ de: req.query.de || addDays(today(), -30), ate: req.query.ate || today() });

  r.get('/relatorios/vendedores', need('rel.ver'), wrap(req => {
    const { de, ate } = periodo(req);
    // vendas do vendedor + OS faturadas do técnico (a data da OS é a do faturamento, a mesma regra do Painel)
    const rows = db.prepare(`SELECT u.id, u.nome, u.comissao_pct,
      (SELECT COUNT(*) FROM vendas v WHERE v.vendedor_id=u.id AND v.status='concluida' AND date(v.created_at) BETWEEN @de AND @ate) vendas,
      (SELECT COALESCE(SUM(v.total-v.devolvido),0) FROM vendas v WHERE v.vendedor_id=u.id AND v.status='concluida' AND date(v.created_at) BETWEEN @de AND @ate) total_vendas,
      (SELECT COUNT(*) FROM os o WHERE o.tecnico_id=u.id AND o.status='faturada' AND EXISTS (SELECT 1 FROM lancamentos l WHERE l.origem='os' AND l.origem_id=o.id AND l.tipo='receber' AND l.cancelado=0 AND date(l.created_at) BETWEEN @de AND @ate)) os,
      (SELECT COALESCE(SUM(o.total),0) FROM os o WHERE o.tecnico_id=u.id AND o.status='faturada' AND EXISTS (SELECT 1 FROM lancamentos l WHERE l.origem='os' AND l.origem_id=o.id AND l.tipo='receber' AND l.cancelado=0 AND date(l.created_at) BETWEEN @de AND @ate)) total_os
      FROM users u WHERE u.ativo=1`).all({ de, ate });
    return rows.filter(x => x.vendas + x.os > 0).map(x => {
      const total = r2(x.total_vendas + x.total_os);
      return { id: x.id, nome: x.nome, comissao_pct: x.comissao_pct, vendas: x.vendas, os: x.os, total_vendas: r2(x.total_vendas), total_os: r2(x.total_os), total, comissao: r2(total * x.comissao_pct / 100) };
    }).sort((a, b) => b.total - a.total);
  }));

  r.get('/relatorios/lucro', need('custo.ver'), wrap(req => {
    const { de, ate } = periodo(req);
    // itens das vendas concluídas + itens das OS faturadas (peças e serviços)
    return db.prepare(`SELECT produto_id, descricao, SUM(qtd) qtd, ROUND(SUM(receita),2) receita, ROUND(SUM(custo),2) custo FROM (
        SELECT COALESCE(vi.produto_id,0) produto_id, vi.descricao descricao, (vi.qtd-vi.qtd_devolvida) qtd,
          (vi.qtd-vi.qtd_devolvida)*vi.unitario*(CASE WHEN v.subtotal>0 THEN v.total/v.subtotal ELSE 1 END) receita, (vi.qtd-vi.qtd_devolvida)*vi.custo custo
        FROM venda_itens vi JOIN vendas v ON v.id=vi.venda_id WHERE v.status='concluida' AND date(v.created_at) BETWEEN @de AND @ate
        UNION ALL
        SELECT COALESCE(oi.produto_id,0), oi.descricao, oi.qtd, oi.total, oi.qtd*oi.custo
        FROM os_itens oi JOIN os o ON o.id=oi.os_id WHERE o.status='faturada' AND EXISTS (SELECT 1 FROM lancamentos l WHERE l.origem='os' AND l.origem_id=o.id AND l.tipo='receber' AND l.cancelado=0 AND date(l.created_at) BETWEEN @de AND @ate)
      ) GROUP BY produto_id, descricao ORDER BY receita DESC LIMIT 200`).all({ de, ate })
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
