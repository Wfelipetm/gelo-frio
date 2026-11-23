'use strict';
const { can, r2 } = require('../services');

module.exports = (r, ctx) => {
  const { db, need, wrap, bad, S } = ctx;
  const like = q => `%${String(q || '').trim()}%`;
  const str = v => (v == null ? null : String(v).trim() || null);

  // ---------- clientes ----------
  r.get('/clientes', need('cliente.ver'), wrap(req => {
    const q = like(req.query.q);
    return db.prepare(`SELECT * FROM clientes WHERE (ativo=1 OR ?) AND (nome LIKE ? OR doc LIKE ? OR telefone LIKE ?) ORDER BY nome LIMIT 300`)
      .all(req.query.todos ? 1 : 0, q, q, q);
  }));
  r.post('/clientes', need('cliente.gerir'), wrap(req => {
    const b = req.body;
    if (!str(b.nome)) throw bad('Informe o nome do cliente');
    const id = db.prepare('INSERT INTO clientes(nome,doc,telefone,email,endereco,obs) VALUES(?,?,?,?,?,?)')
      .run(str(b.nome), str(b.doc), str(b.telefone), str(b.email), str(b.endereco), str(b.obs)).lastInsertRowid;
    return { id };
  }));
  r.put('/clientes/:id', need('cliente.gerir'), wrap(req => {
    const b = req.body;
    if (!str(b.nome)) throw bad('Informe o nome do cliente');
    db.prepare('UPDATE clientes SET nome=?,doc=?,telefone=?,email=?,endereco=?,obs=?,ativo=? WHERE id=?')
      .run(str(b.nome), str(b.doc), str(b.telefone), str(b.email), str(b.endereco), str(b.obs), b.ativo === false || b.ativo === 0 ? 0 : 1, +req.params.id);
    return { ok: true };
  }));
  r.get('/clientes/:id', need('cliente.ver'), wrap(req => {
    const id = +req.params.id;
    const c = db.prepare('SELECT * FROM clientes WHERE id=?').get(id);
    if (!c) throw bad('Cliente não encontrado', 404);
    return {
      ...c,
      equipamentos: db.prepare('SELECT * FROM equipamentos WHERE cliente_id=? AND ativo=1 ORDER BY id DESC').all(id),
      vendas: db.prepare(`SELECT id,numero,total,status,forma_pgto,created_at FROM vendas WHERE cliente_id=? ORDER BY id DESC LIMIT 20`).all(id),
      orcamentos: db.prepare(`SELECT id,numero,total,status,created_at FROM orcamentos WHERE cliente_id=? ORDER BY id DESC LIMIT 20`).all(id),
      os: db.prepare(`SELECT id,numero,tipo,status,total,created_at FROM os WHERE cliente_id=? ORDER BY id DESC LIMIT 20`).all(id),
    };
  }));

  // ---------- equipamentos ----------
  r.post('/equipamentos', need('cliente.gerir'), wrap(req => {
    const b = req.body;
    if (!db.prepare('SELECT 1 FROM clientes WHERE id=?').get(b.cliente_id)) throw bad('Cliente não encontrado');
    const id = db.prepare('INSERT INTO equipamentos(cliente_id,marca,modelo,btus,serie,local_instalacao,garantia_ate,obs) VALUES(?,?,?,?,?,?,?,?)')
      .run(b.cliente_id, str(b.marca), str(b.modelo), parseInt(b.btus, 10) || null, str(b.serie), str(b.local_instalacao), str(b.garantia_ate), str(b.obs)).lastInsertRowid;
    return { id };
  }));
  r.put('/equipamentos/:id', need('cliente.gerir'), wrap(req => {
    const b = req.body;
    db.prepare('UPDATE equipamentos SET marca=?,modelo=?,btus=?,serie=?,local_instalacao=?,garantia_ate=?,obs=?,ativo=? WHERE id=?')
      .run(str(b.marca), str(b.modelo), parseInt(b.btus, 10) || null, str(b.serie), str(b.local_instalacao), str(b.garantia_ate), str(b.obs), b.ativo === false ? 0 : 1, +req.params.id);
    return { ok: true };
  }));

  // ---------- produtos ----------
  const outP = (req, p) => { if (can(req.user.role, 'custo.ver')) return p; const { custo, ...rest } = p; return rest; };
  r.get('/produtos', need('estoque.ver'), wrap(req => {
    const q = like(req.query.q);
    const where = [`(ativo=1 OR @todos)`, `(descricao LIKE @q OR codigo LIKE @q OR cod_fabricante LIKE @q OR ean LIKE @q)`];
    if (req.query.tipo) where.push('tipo=@tipo');
    if (req.query.baixo) where.push(`tipo='peca' AND minimo>0 AND estoque<=minimo`);
    const rows = db.prepare(`SELECT * FROM produtos WHERE ${where.join(' AND ')} ORDER BY descricao LIMIT @limit`)
      .all({ q, todos: req.query.todos ? 1 : 0, tipo: req.query.tipo || null, limit: Math.min(+req.query.limit || 300, 2000) });
    return rows.map(p => outP(req, p));
  }));
  r.get('/produtos/:id', need('estoque.ver'), wrap(req => {
    const p = S.produto(+req.params.id);
    if (!p) throw bad('Produto não encontrado', 404);
    return outP(req, p);
  }));

  const prodFields = b => {
    if (!str(b.descricao)) throw bad('Informe a descrição do produto');
    const tipo = b.tipo === 'servico' ? 'servico' : 'peca';
    const gas = tipo === 'peca' ? str(b.gas_tipo) : null;
    return {
      codigo: str(b.codigo), cod_fabricante: str(b.cod_fabricante), ean: str(b.ean), descricao: str(b.descricao),
      unidade: gas ? 'kg' : (str(b.unidade) || 'un'), tipo, custo: r2(b.custo), preco: r2(b.preco),
      minimo: Number(b.minimo) || 0, gas_tipo: gas, cilindro_kg: gas ? (Number(b.cilindro_kg) || null) : null,
      controla_serie: b.controla_serie ? 1 : 0,
    };
  };
  r.post('/produtos', need('estoque.gerir'), wrap(req => {
    const f = prodFields(req.body);
    if (f.codigo && db.prepare('SELECT 1 FROM produtos WHERE codigo=?').get(f.codigo)) throw bad('Já existe um produto com esse código');
    const id = db.prepare(`INSERT INTO produtos(codigo,cod_fabricante,ean,descricao,unidade,tipo,custo,preco,minimo,gas_tipo,cilindro_kg,controla_serie)
      VALUES(@codigo,@cod_fabricante,@ean,@descricao,@unidade,@tipo,@custo,@preco,@minimo,@gas_tipo,@cilindro_kg,@controla_serie)`).run(f).lastInsertRowid;
    if (!f.codigo) db.prepare('UPDATE produtos SET codigo=? WHERE id=?').run('P' + String(id).padStart(5, '0'), id);
    S.log(req.user, 'produto.criar', f.descricao);
    return { id };
  }));
  r.put('/produtos/:id', need('estoque.gerir'), wrap(req => {
    const id = +req.params.id;
    const old = S.produto(id);
    if (!old) throw bad('Produto não encontrado', 404);
    const f = prodFields(req.body);
    f.codigo = f.codigo || old.codigo;
    if (db.prepare('SELECT 1 FROM produtos WHERE codigo=? AND id<>?').get(f.codigo, id)) throw bad('Já existe um produto com esse código');
    db.prepare(`UPDATE produtos SET codigo=@codigo,cod_fabricante=@cod_fabricante,ean=@ean,descricao=@descricao,unidade=@unidade,tipo=@tipo,custo=@custo,preco=@preco,
      minimo=@minimo,gas_tipo=@gas_tipo,cilindro_kg=@cilindro_kg,controla_serie=@controla_serie,ativo=@ativo WHERE id=@id`)
      .run({ ...f, id, ativo: req.body.ativo === false || req.body.ativo === 0 ? 0 : 1 });
    if (f.gas_tipo) S.syncGasStock(f.gas_tipo);
    S.log(req.user, 'produto.editar', `${old.descricao}${old.preco !== f.preco ? ` preço ${old.preco}→${f.preco}` : ''}`);
    return { ok: true };
  }));
};
