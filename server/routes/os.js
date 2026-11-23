'use strict';
const { can, r2, r3, today, brl } = require('../services');

module.exports = (r, ctx) => {
  const { db, need, wrap, bad, S } = ctx;
  const like = q => `%${String(q || '').trim()}%`;
  const TIPOS = ['instalacao', 'corretiva', 'preventiva', 'visita', 'outro'];
  const FECHADAS = ['concluida', 'faturada', 'cancelada'];

  const CHECKLISTS = {
    instalacao: ['Fixação das unidades', 'Vácuo na tubulação', 'Teste de estanqueidade', 'Ligação elétrica', 'Dreno testado', 'Teste de funcionamento', 'Instrução ao cliente'],
    corretiva: ['Limpeza dos filtros', 'Medição de pressão', 'Teste do capacitor', 'Corrente do compressor', 'Verificação do dreno', 'Teste de estanqueidade', 'Temperatura na saída'],
    preventiva: ['Limpeza dos filtros', 'Limpeza da evaporadora', 'Limpeza da condensadora', 'Verificação do dreno', 'Aperto das conexões elétricas', 'Medição de temperatura'],
    visita: ['Medição do local', 'Verificação elétrica', 'Fotos do local'],
    outro: ['Serviço executado', 'Teste de funcionamento'],
  };
  r.get('/os/checklist/:tipo', need('os.ver'), wrap(req => (CHECKLISTS[req.params.tipo] || CHECKLISTS.outro).map(t => ({ t, ok: false }))));

  // Técnico só mexe nas próprias OS; supervisor/master em todas
  const podeEditar = (user, o) => can(user.role, 'os.gerir') || (can(user.role, 'os.propria') && o.tecnico_id === user.id);
  const getOS = (req, id) => {
    const o = db.prepare(`SELECT o.*, c.nome cliente, c.telefone cliente_tel, c.endereco cliente_endereco, u.nome tecnico,
      e.marca eq_marca, e.modelo eq_modelo, e.btus eq_btus, e.serie eq_serie, e.garantia_ate eq_garantia, e.local_instalacao eq_local
      FROM os o JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.tecnico_id LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE o.id=?`).get(id);
    if (!o) throw bad('OS não encontrada', 404);
    if (!can(req.user.role, 'os.gerir') && can(req.user.role, 'os.propria') && o.tecnico_id !== req.user.id) throw bad('Esta OS é de outro técnico', 403);
    return o;
  };

  r.get('/os', need('os.ver'), wrap(req => {
    const where = ['1=1']; const a = [];
    if (req.query.status) { where.push('o.status=?'); a.push(req.query.status); }
    if (req.query.abertas) where.push(`o.status IN('aberta','agendada','em_andamento')`);
    if (req.query.q) { where.push('(CAST(o.numero AS TEXT) LIKE ? OR c.nome LIKE ?)'); a.push(like(req.query.q), like(req.query.q)); }
    if (!can(req.user.role, 'os.gerir') && can(req.user.role, 'os.propria')) { where.push('o.tecnico_id=?'); a.push(req.user.id); }
    else if (req.query.tecnico_id) { where.push('o.tecnico_id=?'); a.push(+req.query.tecnico_id); }
    return db.prepare(`SELECT o.id,o.numero,o.tipo,o.status,o.agendada_para,o.total,o.descricao,o.created_at,o.concluida_em,o.tecnico_id,
      c.nome cliente, c.endereco cliente_endereco, u.nome tecnico, e.marca eq_marca, e.modelo eq_modelo, e.btus eq_btus
      FROM os o JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.tecnico_id LEFT JOIN equipamentos e ON e.id=o.equipamento_id
      WHERE ${where.join(' AND ')} ORDER BY CASE WHEN o.status IN('aberta','agendada','em_andamento') THEN 0 ELSE 1 END, COALESCE(o.agendada_para,'9999') ASC, o.id DESC LIMIT 300`).all(...a);
  }));

  r.get('/os/:id', need('os.ver'), wrap(req => {
    const o = getOS(req, +req.params.id);
    let itens = db.prepare('SELECT i.*, ci.numero cilindro FROM os_itens i LEFT JOIN cilindros ci ON ci.id=i.cilindro_id WHERE i.os_id=? ORDER BY i.id').all(o.id);
    if (!can(req.user.role, 'custo.ver')) itens = itens.map(({ custo, ...x }) => x);
    o.itens = itens;
    o.checklist = o.checklist ? JSON.parse(o.checklist) : null;
    o.fotos = db.prepare('SELECT id, legenda, created_at FROM os_fotos WHERE os_id=? ORDER BY id').all(o.id);
    o.editavel = !FECHADAS.includes(o.status) && podeEditar(req.user, o);
    return o;
  }));

  const salvarItens = (osId, rows) => {
    db.prepare('DELETE FROM os_itens WHERE os_id=?').run(osId);
    const ins = db.prepare('INSERT INTO os_itens(os_id,tipo,produto_id,descricao,unidade,qtd,unitario,custo,total,cilindro_id) VALUES(?,?,?,?,?,?,?,?,?,?)');
    rows.forEach(x => ins.run(osId, x.tipo, x.produto_id, x.descricao, x.unidade, x.qtd, x.unitario, x.custo, x.total, x.cilindro_id));
    db.prepare('UPDATE os SET total=? WHERE id=?').run(r2(rows.reduce((s, x) => s + x.total, 0)), osId);
  };

  ctx.criarOS = (user, b) => {
    if (!db.prepare('SELECT 1 FROM clientes WHERE id=?').get(b.cliente_id)) throw bad('Selecione o cliente da OS');
    if (b.tecnico_id && !db.prepare("SELECT 1 FROM users WHERE id=? AND ativo=1").get(b.tecnico_id)) throw bad('Técnico inválido');
    const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'corretiva';
    const rows = (b.itens || []).length ? S.normItens(b.itens) : [];
    const numero = S.nextSeq('os');
    const id = db.prepare(`INSERT INTO os(numero,cliente_id,equipamento_id,tecnico_id,tipo,status,agendada_para,descricao,checklist,orcamento_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(numero, b.cliente_id, b.equipamento_id || null, b.tecnico_id || null, tipo, b.agendada_para ? 'agendada' : 'aberta', b.agendada_para || null,
        b.descricao || null, JSON.stringify(b.checklist || (CHECKLISTS[tipo] || []).map(t => ({ t, ok: false }))), b.orcamento_id || null, user.id).lastInsertRowid;
    salvarItens(id, rows);
    S.log(user, 'os.criar', `OS ${numero}`);
    return { id, numero };
  };
  r.post('/os', need('os.gerir'), wrap(req => db.transaction(() => ctx.criarOS(req.user, req.body))()));

  r.put('/os/:id', need('os.ver'), wrap(req => db.transaction(() => {
    const o = getOS(req, +req.params.id);
    if (FECHADAS.includes(o.status)) throw bad('Esta OS já foi concluída/cancelada e não pode ser alterada');
    if (!podeEditar(req.user, o)) throw bad('Sem permissão para alterar esta OS', 403);
    const b = req.body; const gerir = can(req.user.role, 'os.gerir');
    const rows = Array.isArray(b.itens) ? S.normItens(b.itens) : null;
    if (gerir) {
      db.prepare('UPDATE os SET cliente_id=?, equipamento_id=?, tecnico_id=?, tipo=?, agendada_para=?, descricao=? WHERE id=?')
        .run(b.cliente_id ?? o.cliente_id, b.equipamento_id === undefined ? o.equipamento_id : (b.equipamento_id || null), b.tecnico_id === undefined ? o.tecnico_id : (b.tecnico_id || null),
          TIPOS.includes(b.tipo) ? b.tipo : o.tipo, b.agendada_para === undefined ? o.agendada_para : (b.agendada_para || null), b.descricao ?? o.descricao, o.id);
      if (b.agendada_para && o.status === 'aberta') db.prepare("UPDATE os SET status='agendada' WHERE id=?").run(o.id);
    }
    if (b.checklist) db.prepare('UPDATE os SET checklist=? WHERE id=?').run(JSON.stringify(b.checklist), o.id);
    if (b.laudo !== undefined) db.prepare('UPDATE os SET laudo=? WHERE id=?').run(b.laudo, o.id);
    if (rows) salvarItens(o.id, rows);
    return { ok: true };
  })()));

  r.post('/os/:id/status', need('os.ver'), wrap(req => {
    const o = getOS(req, +req.params.id);
    if (!podeEditar(req.user, o)) throw bad('Sem permissão', 403);
    if (FECHADAS.includes(o.status)) throw bad('OS já encerrada');
    if (!['aberta', 'agendada', 'em_andamento'].includes(req.body.status)) throw bad('Status inválido');
    db.prepare('UPDATE os SET status=? WHERE id=?').run(req.body.status, o.id);
    return { ok: true };
  }));

  r.post('/os/:id/concluir', need('os.ver'), wrap(req => db.transaction(() => {
    const o = getOS(req, +req.params.id);
    if (!podeEditar(req.user, o)) throw bad('Sem permissão', 403);
    if (FECHADAS.includes(o.status)) throw bad('OS já encerrada');
    const itens = db.prepare('SELECT * FROM os_itens WHERE os_id=?').all(o.id);
    const rows = itens.map(i => ({ ...i, produto: i.produto_id ? S.produto(i.produto_id) : null }));
    S.baixarItens(rows, { origem: 'os', origem_id: o.id, user_id: req.user.id, equipamento_id: o.equipamento_id });
    const upd = db.prepare('UPDATE os_itens SET cilindro_id=? WHERE id=?');
    rows.forEach(x => x.cilindro_id && upd.run(x.cilindro_id, x.id));
    const b = req.body;
    db.prepare(`UPDATE os SET status='concluida', concluida_em=datetime('now','localtime'), laudo=COALESCE(?,laudo), assinatura=COALESCE(?,assinatura), assinatura_nome=COALESCE(?,assinatura_nome),
      checklist=COALESCE(?,checklist) WHERE id=?`).run(b.laudo ?? null, b.assinatura ?? null, b.assinatura_nome ?? null, b.checklist ? JSON.stringify(b.checklist) : null, o.id);
    S.log(req.user, 'os.concluir', `OS ${o.numero}`);
    return { ok: true };
  })()));

  r.post('/os/:id/faturar', need('os.gerir'), wrap(req => db.transaction(() => {
    const o = getOS(req, +req.params.id);
    if (o.status !== 'concluida') throw bad('Só é possível faturar uma OS concluída');
    if (o.total > 0) S.receberVenda({ descricao: `OS nº ${o.numero}`, valor: o.total, forma: req.body.forma_pgto || 'dinheiro', vencimento: req.body.vencimento, origem: 'os', origem_id: o.id, cliente_id: o.cliente_id, user_id: req.user.id });
    db.prepare("UPDATE os SET status='faturada', faturada_forma=? WHERE id=?").run(req.body.forma_pgto || 'dinheiro', o.id);
    S.log(req.user, 'os.faturar', `OS ${o.numero} ${brl(o.total)}`);
    return { ok: true };
  })()));

  r.post('/os/:id/cancelar', need('os.gerir'), wrap(req => {
    const o = getOS(req, +req.params.id);
    if (['concluida', 'faturada'].includes(o.status)) throw bad('OS concluída não pode ser cancelada');
    db.prepare("UPDATE os SET status='cancelada' WHERE id=?").run(o.id);
    S.log(req.user, 'os.cancelar', `OS ${o.numero}`);
    return { ok: true };
  }));

  // ---------- fotos ----------
  r.post('/os/:id/fotos', need('os.ver'), wrap(req => {
    const o = getOS(req, +req.params.id);
    if (!podeEditar(req.user, o) && !can(req.user.role, 'os.gerir')) throw bad('Sem permissão', 403);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(req.body.data || ''));
    if (!m) throw bad('Imagem inválida');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) throw bad('Imagem muito grande');
    const id = db.prepare('INSERT INTO os_fotos(os_id,legenda,mime,data) VALUES(?,?,?,?)').run(o.id, String(req.body.legenda || '').slice(0, 80) || null, m[1], buf).lastInsertRowid;
    return { id };
  }));
  r.get('/os/:id/fotos/:fid', need('os.ver'), (req, res) => {
    try { getOS(req, +req.params.id); } catch (e) { return res.status(e.status || 400).json({ erro: e.message }); }
    const f = db.prepare('SELECT mime,data FROM os_fotos WHERE id=? AND os_id=?').get(+req.params.fid, +req.params.id);
    if (!f) return res.status(404).end();
    res.type(f.mime).set('Cache-Control', 'private, max-age=3600').send(f.data);
  });
  r.delete('/os/:id/fotos/:fid', need('os.ver'), wrap(req => {
    const o = getOS(req, +req.params.id);
    if (!podeEditar(req.user, o)) throw bad('Sem permissão', 403);
    db.prepare('DELETE FROM os_fotos WHERE id=? AND os_id=?').run(+req.params.fid, o.id);
    return { ok: true };
  }));

  // ---------- manutenção preventiva: clientes com equipamento sem serviço há X meses ----------
  r.get('/manutencoes/vencendo', need('os.ver'), wrap(() => {
    const meses = Number(S.setting('manut_meses')) || 6;
    return db.prepare(`SELECT e.id equipamento_id, e.marca, e.modelo, e.btus, c.id cliente_id, c.nome cliente, c.telefone,
      (SELECT MAX(date(o.concluida_em)) FROM os o WHERE o.equipamento_id=e.id AND o.status IN('concluida','faturada')) ultima
      FROM equipamentos e JOIN clientes c ON c.id=e.cliente_id WHERE e.ativo=1 AND c.ativo=1
      AND ultima IS NOT NULL AND ultima <= date('now','localtime',?) ORDER BY ultima LIMIT 100`).all(`-${meses} months`);
  }));
};
