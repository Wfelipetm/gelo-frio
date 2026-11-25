'use strict';
// Regras de negócio compartilhadas: estoque, gás, financeiro, numeração.

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg, status = 400) => new HttpError(status, msg);

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const r3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
const pad = d => String(d).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmtDate(new Date());
function addDays(dateStr, n) {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const IMEDIATAS = ['dinheiro', 'pix', 'debito', 'credito'];
const FORMAS = [...IMEDIATAS, 'boleto', 'fiado'];

const PERMS = ['venda.criar', 'venda.cancelar', 'orc.gerir', 'cliente.ver', 'cliente.gerir', 'estoque.ver', 'estoque.gerir', 'custo.ver',
  'gas.ver', 'gas.gerir', 'os.ver', 'os.gerir', 'os.propria', 'os.valores', 'fin.ver', 'fin.gerir', 'rel.ver', 'backup', 'usuarios', 'config', 'auditoria'];
const ROLE_PERMS = {
  master: PERMS,
  supervisor: PERMS.filter(p => !['usuarios', 'config', 'auditoria'].includes(p)),
  vendedor: ['venda.criar', 'orc.gerir', 'cliente.ver', 'cliente.gerir', 'estoque.ver', 'gas.ver', 'os.ver', 'os.valores'],
  tecnico: ['estoque.ver', 'gas.ver', 'os.ver', 'os.propria'], // consulta peça e gás; não vê a lista de clientes nem valores (só a própria OS, que traz o endereço)
};
const can = (role, perm) => (ROLE_PERMS[role] || []).includes(perm);

function makeServices(db) {
  const S = {};
  S.nextSeq = name => {
    db.prepare('INSERT INTO seq(name,value) VALUES(?,1) ON CONFLICT(name) DO UPDATE SET value=value+1').run(name);
    return db.prepare('SELECT value FROM seq WHERE name=?').pluck().get(name);
  };
  S.numeroCilindro = () => {
    let n;
    do { n = 'C-' + String(S.nextSeq('cilindro')).padStart(4, '0'); } while (db.prepare('SELECT 1 FROM cilindros WHERE numero=?').get(n));
    return n;
  };
  S.setting = k => db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(k);
  S.log = (user, acao, detalhe) =>
    db.prepare('INSERT INTO audit(user_id,username,acao,detalhe) VALUES(?,?,?,?)').run(user?.id ?? null, user?.username ?? null, acao, detalhe ?? null);

  S.produto = id => db.prepare('SELECT * FROM produtos WHERE id=?').get(id);

  S.syncGasStock = tipo => {
    db.prepare(`UPDATE produtos SET estoque=(SELECT COALESCE(SUM(saldo_kg),0) FROM cilindros WHERE gas_tipo=? AND ativo=1) WHERE gas_tipo=?`).run(tipo, tipo);
  };

  // Movimentação de estoque (qtd com sinal: + entra, - sai)
  S.moveStock = ({ produto_id, qtd, tipo, custo = null, origem = null, origem_id = null, obs = null, user_id = null, allowNegative = false }) => {
    const p = S.produto(produto_id);
    if (!p) throw bad('Produto não encontrado');
    if (p.tipo === 'servico') return;
    if (p.gas_tipo) throw bad(`"${p.descricao}" é gás: o estoque é controlado por cilindro`);
    const novo = r3(p.estoque + qtd);
    if (novo < 0 && !allowNegative && S.setting('estoque_negativo') !== '1')
      throw bad(`Estoque insuficiente de "${p.descricao}" (disponível: ${p.estoque} ${p.unidade})`);
    db.prepare('UPDATE produtos SET estoque=? WHERE id=?').run(novo, produto_id);
    db.prepare(`INSERT INTO movimentacoes(produto_id,tipo,qtd,custo,saldo_apos,origem,origem_id,obs,user_id) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(produto_id, tipo, r3(qtd), custo, novo, origem, origem_id, obs, user_id);
  };

  S.autoCilindro = (gas_tipo, kg) => {
    const c = db.prepare(`SELECT * FROM cilindros WHERE ativo=1 AND gas_tipo=? AND saldo_kg>=? ORDER BY (local='Loja') DESC, saldo_kg ASC LIMIT 1`).get(gas_tipo, kg);
    if (!c) throw bad(`Nenhum cilindro de ${gas_tipo} com ${kg} kg disponíveis`);
    return c.id;
  };

  // Plano de consumo: um cilindro que tenha tudo (prioriza o da loja, depois o menor suficiente);
  // se nenhum tiver, completa com vários (loja primeiro, esvaziando os menores). Devolve [{ id, kg }]
  S.cilindrosParaGas = (gas_tipo, kg) => {
    const unico = db.prepare(`SELECT id FROM cilindros WHERE ativo=1 AND gas_tipo=? AND saldo_kg>=? ORDER BY (local='Loja') DESC, saldo_kg ASC LIMIT 1`).get(gas_tipo, kg);
    if (unico) return [{ id: unico.id, kg }];
    const todos = db.prepare(`SELECT id, saldo_kg FROM cilindros WHERE ativo=1 AND gas_tipo=? AND saldo_kg>0 ORDER BY (local='Loja') DESC, saldo_kg ASC`).all(gas_tipo);
    const total = r3(todos.reduce((a, c) => a + c.saldo_kg, 0));
    if (total < kg) throw bad(`Gás ${gas_tipo} insuficiente: pedido ${kg} kg e só há ${total} kg nos cilindros`);
    const plano = []; let resta = kg;
    for (const c of todos) { if (resta <= 0) break; const k = r3(Math.min(c.saldo_kg, resta)); plano.push({ id: c.id, kg: k }); resta = r3(resta - k); }
    return plano;
  };

  // Devolução de gás: devolve o kg aos cilindros de onde saiu (o último usado primeiro), sem passar do que saiu de cada um
  S.devolverGas = ({ gas_tipo, qtd, origem, origem_id, user_id = null, obs = 'Devolução', tipoMov = 'estorno' }) => {
    const usos = db.prepare(`SELECT g.cilindro_id, ROUND(SUM(g.kg),3) liq FROM gas_usos g JOIN cilindros c ON c.id=g.cilindro_id
      WHERE g.origem=? AND g.origem_id=? AND c.gas_tipo=? AND c.ativo=1 GROUP BY g.cilindro_id HAVING liq>0 ORDER BY MAX(g.id) DESC`).all(origem, origem_id, gas_tipo);
    let resta = r3(qtd);
    for (const u of usos) { if (resta <= 0) break; const k = r3(Math.min(u.liq, resta)); S.useGas({ cilindro_id: u.cilindro_id, kg: -k, origem, origem_id, user_id, tipoMov, obs }); resta = r3(resta - k); }
    if (resta > 0) { // não achou o rastro (venda antiga): devolve ao primeiro cilindro ativo desse gás
      const cil = db.prepare('SELECT id FROM cilindros WHERE gas_tipo=? AND ativo=1 ORDER BY id LIMIT 1').pluck().get(gas_tipo);
      if (cil) S.useGas({ cilindro_id: cil, kg: -resta, origem, origem_id, user_id, tipoMov, obs });
    }
  };

  // Consumo de gás de um cilindro (kg > 0 consome, kg < 0 devolve)
  S.useGas = ({ cilindro_id, kg, origem, origem_id, equipamento_id = null, user_id = null, tipoMov = 'saida', obs = null }) => {
    const c = db.prepare('SELECT * FROM cilindros WHERE id=?').get(cilindro_id);
    if (!c || !c.ativo) throw bad('Cilindro não encontrado');
    const novo = r3(c.saldo_kg - kg);
    if (novo < 0) throw bad(`Cilindro ${c.numero} só tem ${c.saldo_kg} kg`);
    db.prepare('UPDATE cilindros SET saldo_kg=? WHERE id=?').run(novo, cilindro_id);
    db.prepare('INSERT INTO gas_usos(cilindro_id,kg,origem,origem_id,equipamento_id,user_id) VALUES(?,?,?,?,?,?)')
      .run(cilindro_id, r3(kg), origem, origem_id, equipamento_id, user_id);
    S.syncGasStock(c.gas_tipo);
    const p = db.prepare('SELECT id,estoque,custo FROM produtos WHERE gas_tipo=? ORDER BY id LIMIT 1').get(c.gas_tipo);
    if (p) db.prepare(`INSERT INTO movimentacoes(produto_id,tipo,qtd,custo,saldo_apos,origem,origem_id,obs,user_id) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(p.id, tipoMov, -r3(kg), p.custo, p.estoque, origem, origem_id, obs || `Cilindro ${c.numero}`, user_id);
  };

  S.addLancamento = ({ tipo, descricao, valor, vencimento = null, pago = 0, forma = null, origem = null, origem_id = null, cliente_id = null, pessoa = null, user_id = null }) => {
    valor = r2(valor);
    if (!(valor > 0)) throw bad('Valor inválido');
    return db.prepare(`INSERT INTO lancamentos(tipo,descricao,valor,vencimento,pago,pago_em,forma,origem,origem_id,cliente_id,pessoa,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(tipo, descricao, valor, vencimento || today(), pago ? 1 : 0, pago ? today() : null, forma, origem, origem_id, cliente_id, pessoa, user_id).lastInsertRowid;
  };

  // Recebimento de venda / OS: à vista entra pago, boleto/fiado fica a receber
  S.receberVenda = ({ descricao, valor, forma, vencimento, origem, origem_id, cliente_id, user_id }) => {
    if (!FORMAS.includes(forma)) throw bad('Forma de pagamento inválida');
    const imediato = IMEDIATAS.includes(forma);
    return S.addLancamento({ tipo: 'receber', descricao, valor, vencimento: imediato ? today() : (vencimento || addDays(today(), 30)),
      pago: imediato, forma, origem, origem_id, cliente_id, user_id });
  };

  // Itens de venda/orçamento/OS -> linhas normalizadas
  S.normItens = (itens, { exigeProduto = false } = {}) => {
    if (!Array.isArray(itens) || !itens.length) throw bad('Adicione pelo menos um item');
    return itens.map(it => {
      const qtd = r3(it.qtd);
      if (!(qtd > 0)) throw bad('Quantidade inválida');
      let p = null;
      if (it.produto_id) { p = S.produto(it.produto_id); if (!p || !p.ativo) throw bad('Produto não encontrado ou inativo'); }
      else if (exigeProduto) throw bad('Item sem produto');
      const descricao = String(it.descricao || p?.descricao || '').trim();
      if (!descricao) throw bad('Item sem descrição');
      const unitario = r2(it.unitario ?? p?.preco ?? 0);
      if (unitario < 0) throw bad('Preço inválido');
      return {
        tipo: it.tipo || (p ? (p.tipo === 'servico' ? 'servico' : 'peca') : 'servico'),
        produto_id: p?.id ?? null, produto: p, descricao, unidade: it.unidade || p?.unidade || 'un',
        qtd, unitario, custo: r2(p ? p.custo : (it.custo || 0)), total: r2(qtd * unitario), cilindro_id: it.cilindro_id || null,
      };
    });
  };

  // Baixa de estoque de uma lista de linhas (venda ou OS concluída)
  S.baixarItens = (rows, { origem, origem_id, user_id, equipamento_id = null }) => {
    for (const it of rows) {
      const p = it.produto;
      if (!p || p.tipo !== 'peca') continue;
      if (p.gas_tipo) {
        if (it.cilindro_id) { // cilindro escolhido à mão: usa só ele
          const c = db.prepare('SELECT gas_tipo FROM cilindros WHERE id=?').get(it.cilindro_id);
          if (!c || c.gas_tipo !== p.gas_tipo) throw bad(`Cilindro incompatível com ${p.descricao}`);
          S.useGas({ cilindro_id: it.cilindro_id, kg: it.qtd, origem, origem_id, equipamento_id, user_id });
        } else {
          const plano = S.cilindrosParaGas(p.gas_tipo, it.qtd);
          for (const x of plano) S.useGas({ cilindro_id: x.id, kg: x.kg, origem, origem_id, equipamento_id, user_id });
          it.cilindro_id = plano[0].id; // guarda o primeiro usado (os demais ficam no histórico de usos)
        }
      } else {
        S.moveStock({ produto_id: p.id, qtd: -it.qtd, tipo: 'saida', custo: p.custo, origem, origem_id, user_id });
      }
    }
  };

  S.criarVenda = (user, b) => db.transaction(() => {
    const rows = S.normItens(b.itens);
    const subtotal = r2(rows.reduce((s, r) => s + r.total, 0));
    let desconto = Number(b.desconto_valor) > 0 ? r2(b.desconto_valor) : r2(subtotal * (Number(b.desconto_pct) || 0) / 100);
    if (desconto > subtotal) desconto = subtotal;
    const total = r2(subtotal - desconto);
    const forma = b.forma_pgto || 'dinheiro';
    if (!FORMAS.includes(forma)) throw bad('Forma de pagamento inválida');
    if ((forma === 'fiado' || forma === 'boleto') && !b.cliente_id) throw bad('Venda a prazo precisa de cliente');
    const numero = S.nextSeq('venda');
    const id = db.prepare(`INSERT INTO vendas(numero,cliente_id,vendedor_id,subtotal,desconto,total,forma_pgto,obs,orcamento_id) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(numero, b.cliente_id || null, user.id, subtotal, desconto, total, forma, b.obs || null, b.orcamento_id || null).lastInsertRowid;
    S.baixarItens(rows, { origem: 'venda', origem_id: id, user_id: user.id });
    const ins = db.prepare(`INSERT INTO venda_itens(venda_id,produto_id,descricao,unidade,qtd,unitario,custo,total,cilindro_id) VALUES(?,?,?,?,?,?,?,?,?)`);
    rows.forEach(r => ins.run(id, r.produto_id, r.descricao, r.unidade, r.qtd, r.unitario, r.custo, r.total, r.cilindro_id));
    if (total > 0) S.receberVenda({ descricao: `Venda nº ${numero}`, valor: total, forma, vencimento: b.vencimento, origem: 'venda', origem_id: id, cliente_id: b.cliente_id || null, user_id: user.id });
    S.log(user, 'venda.criar', `Venda ${numero} - ${brl(total)} (${forma})`);
    return { id, numero, total };
  })();

  return S;
}

module.exports = { HttpError, bad, r2, r3, today, addDays, brl, FORMAS, IMEDIATAS, PERMS, ROLE_PERMS, can, makeServices };
