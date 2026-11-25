'use strict';
// Impressão de cupom NÃO FISCAL.
//   modo "spooler" / "rede" : envia ESC/POS direto para a térmica (USB pelo Windows ou IP)
//   modo "comum"            : impressora de escritório (laser/jato): a tela abre a página /print/cupom/... (80 mm) e imprime pelo driver
const path = require('path');
const { can } = require('../services');
const printer = require('../printer');
const C = require('../cupom');

module.exports = (r, ctx) => {
  const { db, S, bad, need, opts } = ctx;
  // wrap() do projeto é síncrono; aqui precisamos de handlers assíncronos
  const aw = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).then(out => { if (out !== undefined && !res.headersSent) res.json(out); }).catch(next);
  const cfg = () => C.configImpressora(S, { arquivo: path.join(opts.dataDir, 'cupom-debug.bin') });

  /** Monta os bytes ESC/POS do cupom (valida existência e permissão). Usado pela impressão e pela página de pré-visualização. */
  ctx.cupomBytes = (tipo, id, user) => {
    const c = cfg();
    if (tipo === 'teste') {
      if (!can(user.role, 'config')) throw bad('Você não tem permissão para isso', 403);
      return { bytes: C.cupomTeste(c, S), log: ['impressao.teste', null] };
    }
    if (tipo === 'venda') {
      if (!can(user.role, 'venda.criar')) throw bad('Você não tem permissão para isso', 403);
      const v = db.prepare(`SELECT v.*, c.nome cliente, u.nome vendedor FROM vendas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN users u ON u.id=v.vendedor_id WHERE v.id=?`).get(id);
      if (!v) throw bad('Venda não encontrada', 404);
      if (!can(user.role, 'venda.cancelar') && v.vendedor_id !== user.id) throw bad('Sem permissão', 403);
      const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id=? ORDER BY id').all(v.id);
      return { bytes: C.cupomVenda(c, S, v, itens), log: ['impressao.venda', `Venda ${v.numero}`] };
    }
    if (tipo === 'orcamento') {
      if (!can(user.role, 'orc.gerir')) throw bad('Você não tem permissão para isso', 403);
      const o = db.prepare(`SELECT o.*, c.nome cliente, c.telefone cliente_tel FROM orcamentos o LEFT JOIN clientes c ON c.id=o.cliente_id WHERE o.id=?`).get(id);
      if (!o) throw bad('Orçamento não encontrado', 404);
      if (!can(user.role, 'venda.cancelar') && o.vendedor_id !== user.id) throw bad('Sem permissão', 403);
      const itens = db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id=? ORDER BY id').all(o.id);
      return { bytes: C.cupomOrcamento(c, S, o, itens), log: ['impressao.orcamento', `Orçamento ${o.numero}`] };
    }
    if (tipo === 'os') {
      if (!can(user.role, 'os.ver')) throw bad('Você não tem permissão para isso', 403);
      const o = db.prepare(`SELECT o.*, c.nome cliente, c.telefone cliente_tel, c.endereco cliente_end, u.nome tecnico, e.marca eq_marca, e.modelo eq_modelo, e.btus eq_btus
        FROM os o JOIN clientes c ON c.id=o.cliente_id LEFT JOIN users u ON u.id=o.tecnico_id LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE o.id=?`).get(id);
      if (!o) throw bad('OS não encontrada', 404);
      if (!can(user.role, 'os.gerir') && can(user.role, 'os.propria') && o.tecnico_id !== user.id) throw bad('Sem permissão', 403);
      const itens = db.prepare('SELECT * FROM os_itens WHERE os_id=? ORDER BY id').all(o.id);
      return { bytes: C.cupomOS(c, S, o, itens, { semValores: !can(user.role, 'os.valores') }), log: ['impressao.os', `OS ${o.numero}`] };
    }
    throw bad('Tipo de cupom inválido', 400);
  };

  const imprimir = tipo => aw(async req => {
    const id = tipo === 'teste' ? 0 : +req.params.id;
    const { bytes, log } = ctx.cupomBytes(tipo, id, req.user);
    const c = cfg();
    S.log(req.user, log[0], log[1]);
    // impressora comum: quem imprime é a tela (Electron imprime direto; no navegador abre a janela de impressão)
    if (c.modo === 'comum') return { ok: true, abrir: `/print/cupom/${tipo}/${id}`, nome: c.nome || '' };
    await printer.send(c, bytes);
    return { ok: true, bytes: bytes.length };
  });

  // impressoras instaladas no Windows (para escolher em Configurações)
  r.get('/impressoras', need('config'), aw(async () => ({ lista: await printer.listPrinters(), plataforma: process.platform })));

  // as permissões de cada tipo são verificadas em ctx.cupomBytes; aqui só exigimos estar logado
  r.post('/impressao/teste', need(null), imprimir('teste'));
  for (const t of ['venda', 'orcamento', 'os']) r.post(`/impressao/${t}/:id`, need(null), imprimir(t));
};
