'use strict';
const { XMLParser } = require('fast-xml-parser');
const { can, r2, r3, today } = require('../services');

module.exports = (r, ctx) => {
  const { db, need, wrap, bad, S } = ctx;
  const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const str = v => (v == null ? null : String(v).trim() || null);

  // ---------- movimentações ----------
  r.get('/movimentacoes', need('estoque.ver'), wrap(req => {
    const where = ['1=1']; const args = [];
    if (req.query.produto_id) { where.push('m.produto_id=?'); args.push(+req.query.produto_id); }
    if (req.query.tipo) { where.push('m.tipo=?'); args.push(req.query.tipo); }
    const rows = db.prepare(`SELECT m.*, p.descricao, p.codigo, p.unidade, u.nome usuario,
      CASE m.origem WHEN 'venda' THEN (SELECT numero FROM vendas WHERE id=m.origem_id) WHEN 'os' THEN (SELECT numero FROM os WHERE id=m.origem_id) END ref_numero
      FROM movimentacoes m JOIN produtos p ON p.id=m.produto_id LEFT JOIN users u ON u.id=m.user_id
      WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT ?`).all(...args, Math.min(+req.query.limit || 200, 2000));
    const ver = can(req.user.role, 'custo.ver');
    return ver ? rows : rows.map(({ custo, ...x }) => x);
  }));

  r.post('/estoque/ajuste', need('estoque.gerir'), wrap(req => {
    const { produto_id, qtd, motivo = 'ajuste', obs } = req.body;
    const q = r3(qtd);
    if (!q) throw bad('Informe a quantidade (positiva para entrar, negativa para sair)');
    if (!['ajuste', 'perda', 'devolucao'].includes(motivo)) throw bad('Motivo inválido');
    db.transaction(() => S.moveStock({ produto_id, qtd: q, tipo: motivo, obs, user_id: req.user.id }))();
    S.log(req.user, 'estoque.ajuste', `produto ${produto_id}: ${q} (${motivo}) ${obs || ''}`);
    return { ok: true };
  }));

  // ---------- entrada de mercadoria ----------
  r.post('/estoque/entrada', need('estoque.gerir'), wrap(req => {
    const b = req.body;
    if (!Array.isArray(b.itens) || !b.itens.length) throw bad('Nenhum item na entrada');
    return db.transaction(() => {
      const entradaId = db.prepare('INSERT INTO entradas(fornecedor,nf_numero,chave,obs,user_id) VALUES(?,?,?,?,?)')
        .run(str(b.fornecedor), str(b.nf_numero), str(b.chave), str(b.obs), req.user.id).lastInsertRowid;
      if (b.chave && db.prepare('SELECT 1 FROM entradas WHERE chave=? AND id<>?').get(b.chave, entradaId)) throw bad('Esta nota (chave de acesso) já foi lançada no estoque');
      let total = 0;
      for (const it of b.itens) {
        let pid = it.produto_id;
        const qtd = r3(it.qtd);
        if (!(qtd > 0)) throw bad('Quantidade inválida em um dos itens');
        if (!pid) {
          const n = it.novo || {};
          if (!str(n.descricao)) throw bad('Produto novo sem descrição');
          const gas = str(n.gas_tipo);
          pid = db.prepare(`INSERT INTO produtos(cod_fabricante,ean,descricao,unidade,tipo,custo,preco,minimo,gas_tipo,cilindro_kg) VALUES(?,?,?,?,'peca',?,?,?,?,?)`)
            .run(str(n.cod_fabricante), str(n.ean), str(n.descricao), gas ? 'kg' : (str(n.unidade) || 'un'), r2(it.custo), r2(it.preco ?? n.preco), Number(n.minimo) || 0, gas, gas ? (Number(n.cilindro_kg) || null) : null).lastInsertRowid;
          db.prepare('UPDATE produtos SET codigo=? WHERE id=?').run('P' + String(pid).padStart(5, '0'), pid);
        }
        const p = S.produto(pid);
        if (!p) throw bad('Produto não encontrado');
        if (p.tipo === 'servico') throw bad(`"${p.descricao}" é serviço e não tem estoque`);
        const custo = r2(it.custo);
        if (p.gas_tipo) {
          // quantidade = nº de cilindros; cada um entra no depósito com a capacidade cheia
          const kg = p.cilindro_kg || Number(it.cilindro_kg) || 0;
          if (!kg) throw bad(`Informe o peso do cilindro de "${p.descricao}" no cadastro do produto`);
          for (let i = 0; i < Math.round(qtd); i++) {
            db.prepare('INSERT INTO cilindros(numero,gas_tipo,capacidade_kg,saldo_kg,local) VALUES(?,?,?,?,?)').run(S.numeroCilindro(), p.gas_tipo, kg, kg, 'Depósito');
          }
          S.syncGasStock(p.gas_tipo);
          const novoSaldo = S.produto(pid).estoque;
          db.prepare(`INSERT INTO movimentacoes(produto_id,tipo,qtd,custo,saldo_apos,origem,origem_id,obs,user_id) VALUES(?,?,?,?,?,?,?,?,?)`)
            .run(pid, 'entrada', r3(Math.round(qtd) * kg), r2(custo / kg), novoSaldo, 'entrada', entradaId, `${Math.round(qtd)} cilindro(s) de ${kg} kg`, req.user.id);
          if (custo > 0) db.prepare('UPDATE produtos SET custo=? WHERE id=?').run(r2(custo / kg), pid);
        } else {
          S.moveStock({ produto_id: pid, qtd, tipo: 'entrada', custo, origem: 'entrada', origem_id: entradaId, user_id: req.user.id });
          if (custo > 0) db.prepare('UPDATE produtos SET custo=? WHERE id=?').run(custo, pid);
        }
        if (it.preco != null && Number(it.preco) > 0) db.prepare('UPDATE produtos SET preco=? WHERE id=?').run(r2(it.preco), pid);
        total += qtd * custo;
      }
      total = r2(total);
      db.prepare('UPDATE entradas SET total=? WHERE id=?').run(total, entradaId);
      for (const [i, pc] of (b.parcelas || []).entries()) {
        if (!(Number(pc.valor) > 0)) continue;
        S.addLancamento({ tipo: 'pagar', descricao: `NF ${b.nf_numero || 's/n'} - ${b.fornecedor || 'Fornecedor'} (${i + 1}/${b.parcelas.length})`,
          valor: pc.valor, vencimento: pc.vencimento || today(), origem: 'entrada', origem_id: entradaId, pessoa: str(b.fornecedor), user_id: req.user.id });
      }
      S.log(req.user, 'estoque.entrada', `NF ${b.nf_numero || '-'} ${b.fornecedor || ''} total ${total}`);
      return { id: entradaId, total };
    })();
  }));

  r.get('/estoque/entradas', need('estoque.ver'), wrap(req => {
    const ver = can(req.user.role, 'custo.ver');
    const rows = db.prepare(`SELECT e.*, u.nome usuario, (SELECT COUNT(*) FROM movimentacoes m WHERE m.origem='entrada' AND m.origem_id=e.id) itens
      FROM entradas e LEFT JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 100`).all();
    return ver ? rows : rows.map(({ total, ...x }) => x);
  }));

  // ---------- leitura de XML da NF-e ----------
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, removeNSPrefix: true });
  const UN = { UN: 'un', UND: 'un', PC: 'un', PÇ: 'un', KG: 'kg', M: 'm', MT: 'm', MTS: 'm', CX: 'un', RL: 'un', RO: 'un', PCT: 'un' };

  // Gás na nota: reconhece pela descrição (GAS/CIL + R410A, R22, R32…) ou pela unidade CIL e tira o peso do cilindro do texto (11,34KG)
  const detectaGas = pr => {
    const desc = String(pr.xProd || ''), un = String(pr.uCom || '').toUpperCase();
    const m = desc.match(/\bR[-\s]?(410A?|407C|404A?|134A|1234\s?YF|600A?|290|22|32|12|502|507)\b/i);
    if (!m || !(/\b(G[AÁ]S|CIL(INDRO)?)\b/i.test(desc) || /^CIL/.test(un))) return null;
    const k = desc.match(/(\d+(?:[.,]\d+)?)\s*KG/i);
    return { gas_tipo: 'R-' + m[1].replace(/\s/g, '').toUpperCase(), cilindro_kg: k ? parseFloat(k[1].replace(',', '.')) : null };
  };
  r.post('/estoque/nfe/preview', need('estoque.gerir'), wrap(req => {
    let j;
    try { j = parser.parse(String(req.body.xml || '')); } catch { throw bad('Arquivo XML inválido'); }
    const inf = (j.nfeProc?.NFe || j.NFe)?.infNFe;
    if (!inf) throw bad('Este arquivo não parece ser uma NF-e (XML de nota fiscal)');
    const margem = Number(S.setting('margem_padrao')) || 0;
    const chave = String(inf['@_Id'] || '').replace(/^NFe/, '');
    const dup = chave && db.prepare('SELECT id FROM entradas WHERE chave=?').get(chave);
    const itens = arr(inf.det).map((d, i) => {
      const pr = d.prod || {};
      const ean = /^\d{8,14}$/.test(String(pr.cEAN || '')) ? String(pr.cEAN) : null;
      const custo = r2(parseFloat(pr.vUnCom));
      const gas = detectaGas(pr);
      let m = db.prepare('SELECT * FROM produtos WHERE ativo=1 AND cod_fabricante IS NOT NULL AND cod_fabricante=?').get(String(pr.cProd || '')) ||
        (ean && db.prepare('SELECT * FROM produtos WHERE ativo=1 AND ean=?').get(ean)) ||
        db.prepare('SELECT * FROM produtos WHERE ativo=1 AND descricao=? COLLATE NOCASE').get(String(pr.xProd || '')) ||
        (gas && db.prepare('SELECT * FROM produtos WHERE ativo=1 AND gas_tipo=? COLLATE NOCASE ORDER BY id LIMIT 1').get(gas.gas_tipo));
      let qtd = parseFloat(pr.qCom) || 0, custoItem = custo;
      const kgCil = (m && m.gas_tipo && m.cilindro_kg) || (gas && gas.cilindro_kg) || null;
      if (gas && String(pr.uCom || '').toUpperCase() === 'KG' && kgCil) { qtd = Math.round(qtd / kgCil) || 1; custoItem = r2(custo * kgCil); } // nota em kg: converte para nº de cilindros
      return {
        n: i + 1, descricao_nf: pr.xProd, cod_fabricante: String(pr.cProd || ''), ean, unidade: gas ? 'kg' : (UN[String(pr.uCom || '').toUpperCase()] || 'un'),
        gas: gas ? { gas_tipo: gas.gas_tipo, cilindro_kg: kgCil } : null,
        qtd, custo: custoItem, preco_sugerido: r2((gas && kgCil ? custoItem / kgCil : custoItem) * (1 + margem / 100)),
        produto_id: m?.id ?? null, produto: m ? { id: m.id, descricao: m.descricao, codigo: m.codigo, preco: m.preco, gas_tipo: m.gas_tipo, cilindro_kg: m.cilindro_kg } : null,
      };
    });
    return {
      fornecedor: inf.emit?.xNome || '', fornecedor_doc: inf.emit?.CNPJ || '', nf_numero: inf.ide?.nNF || '', chave,
      emissao: String(inf.ide?.dhEmi || inf.ide?.dEmi || '').slice(0, 10), total: r2(parseFloat(inf.total?.ICMSTot?.vNF)),
      parcelas: arr(inf.cobr?.dup).map(d => ({ vencimento: d.dVenc, valor: r2(parseFloat(d.vDup)) })),
      ja_lancada: !!dup, itens,
    };
  }));

  // ---------- gás: cilindros ----------
  r.get('/cilindros', need('gas.ver'), wrap(req => db.prepare(`SELECT * FROM cilindros WHERE (ativo=1 OR ?) ORDER BY gas_tipo, local, numero`).all(req.query.todos ? 1 : 0)));
  r.get('/gas/tipos', need('gas.ver'), wrap(() => db.prepare(`SELECT gas_tipo, MIN(minimo) minimo, COALESCE((SELECT SUM(saldo_kg) FROM cilindros c WHERE c.gas_tipo=p.gas_tipo AND c.ativo=1),0) saldo,
    (SELECT COUNT(*) FROM cilindros c WHERE c.gas_tipo=p.gas_tipo AND c.ativo=1) cilindros FROM produtos p WHERE gas_tipo IS NOT NULL AND ativo=1 GROUP BY gas_tipo ORDER BY gas_tipo`).all()));

  r.post('/cilindros', need('gas.gerir'), wrap(req => {
    const { gas_tipo, capacidade_kg, saldo_kg, local = 'Depósito' } = req.body;
    if (!db.prepare('SELECT 1 FROM produtos WHERE gas_tipo=?').get(gas_tipo)) throw bad('Cadastre antes um produto de gás desse tipo (Estoque > Novo produto > tipo de gás)');
    const cap = r3(capacidade_kg); const saldo = saldo_kg === undefined || saldo_kg === '' ? cap : r3(saldo_kg);
    if (!(cap > 0) || saldo < 0 || saldo > cap + 0.001) throw bad('Capacidade/saldo inválidos');
    const numero = str(req.body.numero) || S.numeroCilindro();
    if (db.prepare('SELECT 1 FROM cilindros WHERE numero=?').get(numero)) throw bad('Já existe um cilindro com esse número');
    const id = db.transaction(() => {
      const id = db.prepare('INSERT INTO cilindros(numero,gas_tipo,capacidade_kg,saldo_kg,local) VALUES(?,?,?,?,?)').run(numero, gas_tipo, cap, saldo, str(local) || 'Depósito').lastInsertRowid;
      S.syncGasStock(gas_tipo);
      return id;
    })();
    S.log(req.user, 'gas.cilindro', `${numero} ${gas_tipo} ${saldo}kg`);
    return { id };
  }));

  r.put('/cilindros/:id', need('gas.gerir'), wrap(req => {
    const c = db.prepare('SELECT * FROM cilindros WHERE id=?').get(+req.params.id);
    if (!c) throw bad('Cilindro não encontrado', 404);
    db.transaction(() => {
      if (req.body.local !== undefined) db.prepare('UPDATE cilindros SET local=? WHERE id=?').run(str(req.body.local) || 'Depósito', c.id);
      if (req.body.ativo !== undefined) db.prepare('UPDATE cilindros SET ativo=? WHERE id=?').run(req.body.ativo ? 1 : 0, c.id);
      if (req.body.saldo_kg !== undefined && req.body.saldo_kg !== '') {
        const novo = r3(req.body.saldo_kg);
        if (novo < 0 || novo > c.capacidade_kg + 0.001) throw bad('Saldo fora da capacidade do cilindro');
        const diff = r3(c.saldo_kg - novo);
        if (diff) {
          db.prepare('UPDATE cilindros SET saldo_kg=? WHERE id=?').run(novo, c.id);
          db.prepare('INSERT INTO gas_usos(cilindro_id,kg,origem,user_id) VALUES(?,?,?,?)').run(c.id, diff, 'ajuste', req.user.id);
        }
      }
      S.syncGasStock(c.gas_tipo);
    })();
    S.log(req.user, 'gas.editar', `${c.numero}`);
    return { ok: true };
  }));

  r.get('/gas/usos', need('gas.ver'), wrap(req => db.prepare(`SELECT g.*, c.numero cilindro, c.gas_tipo, u.nome usuario,
    CASE g.origem WHEN 'venda' THEN (SELECT numero FROM vendas WHERE id=g.origem_id) WHEN 'os' THEN (SELECT numero FROM os WHERE id=g.origem_id) END ref_numero,
    CASE g.origem WHEN 'os' THEN (SELECT cl.nome FROM os JOIN clientes cl ON cl.id=os.cliente_id WHERE os.id=g.origem_id)
                  WHEN 'venda' THEN (SELECT cl.nome FROM vendas v LEFT JOIN clientes cl ON cl.id=v.cliente_id WHERE v.id=g.origem_id) END cliente
    FROM gas_usos g JOIN cilindros c ON c.id=g.cilindro_id LEFT JOIN users u ON u.id=g.user_id ORDER BY g.id DESC LIMIT ?`).all(Math.min(+req.query.limit || 100, 500))));

  // equipamentos com 3+ cargas de gás em 12 meses (possível vazamento)
  r.get('/gas/alertas', need('gas.ver'), wrap(() => db.prepare(`SELECT e.id, e.marca, e.modelo, e.serie, cl.nome cliente, COUNT(*) cargas, ROUND(SUM(g.kg),2) kg, MIN(g.created_at) desde
    FROM gas_usos g JOIN equipamentos e ON e.id=g.equipamento_id JOIN clientes cl ON cl.id=e.cliente_id
    WHERE g.origem='os' AND g.kg>0 AND g.created_at >= date('now','localtime','-12 months') GROUP BY e.id HAVING COUNT(*)>=3`).all()));
};
