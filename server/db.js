'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SCHEMA = `
CREATE TABLE users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, nome TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('master','supervisor','vendedor','tecnico')),
  pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0, comissao_pct REAL NOT NULL DEFAULT 0, telefone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE seq(name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE audit(id INTEGER PRIMARY KEY, user_id INTEGER, username TEXT, acao TEXT, detalhe TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE clientes(
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, doc TEXT, telefone TEXT, email TEXT, endereco TEXT, obs TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE equipamentos(
  id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id), marca TEXT, modelo TEXT, btus INTEGER,
  serie TEXT, local_instalacao TEXT, garantia_ate TEXT, obs TEXT, ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE produtos(
  id INTEGER PRIMARY KEY, codigo TEXT UNIQUE, cod_fabricante TEXT, ean TEXT, descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'un', tipo TEXT NOT NULL DEFAULT 'peca' CHECK(tipo IN('peca','servico')),
  custo REAL NOT NULL DEFAULT 0, preco REAL NOT NULL DEFAULT 0, estoque REAL NOT NULL DEFAULT 0, minimo REAL NOT NULL DEFAULT 0,
  gas_tipo TEXT, cilindro_kg REAL, controla_serie INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX ix_prod_fab ON produtos(cod_fabricante); CREATE INDEX ix_prod_ean ON produtos(ean);
CREATE TABLE movimentacoes(
  id INTEGER PRIMARY KEY, produto_id INTEGER NOT NULL REFERENCES produtos(id), tipo TEXT NOT NULL, qtd REAL NOT NULL,
  custo REAL, saldo_apos REAL, origem TEXT, origem_id INTEGER, obs TEXT, user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX ix_mov_prod ON movimentacoes(produto_id);
CREATE TABLE entradas(
  id INTEGER PRIMARY KEY, fornecedor TEXT, nf_numero TEXT, chave TEXT, total REAL, obs TEXT, user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE cilindros(
  id INTEGER PRIMARY KEY, numero TEXT UNIQUE NOT NULL, gas_tipo TEXT NOT NULL, capacidade_kg REAL NOT NULL DEFAULT 0,
  saldo_kg REAL NOT NULL DEFAULT 0, local TEXT NOT NULL DEFAULT 'Depósito', ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE gas_usos(
  id INTEGER PRIMARY KEY, cilindro_id INTEGER NOT NULL REFERENCES cilindros(id), kg REAL NOT NULL, origem TEXT,
  origem_id INTEGER, equipamento_id INTEGER, user_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE vendas(
  id INTEGER PRIMARY KEY, numero INTEGER UNIQUE NOT NULL, cliente_id INTEGER REFERENCES clientes(id), vendedor_id INTEGER REFERENCES users(id),
  subtotal REAL NOT NULL, desconto REAL NOT NULL DEFAULT 0, total REAL NOT NULL, forma_pgto TEXT, status TEXT NOT NULL DEFAULT 'concluida',
  obs TEXT, orcamento_id INTEGER, devolvido REAL NOT NULL DEFAULT 0, cancelada_em TEXT, cancelada_motivo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX ix_vendas_data ON vendas(created_at);
CREATE TABLE venda_itens(
  id INTEGER PRIMARY KEY, venda_id INTEGER NOT NULL REFERENCES vendas(id), produto_id INTEGER REFERENCES produtos(id),
  descricao TEXT NOT NULL, unidade TEXT, qtd REAL NOT NULL, qtd_devolvida REAL NOT NULL DEFAULT 0, unitario REAL NOT NULL,
  custo REAL NOT NULL DEFAULT 0, total REAL NOT NULL, cilindro_id INTEGER);
CREATE INDEX ix_vi_venda ON venda_itens(venda_id);
CREATE TABLE orcamentos(
  id INTEGER PRIMARY KEY, numero INTEGER UNIQUE NOT NULL, cliente_id INTEGER REFERENCES clientes(id), vendedor_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'rascunho', validade TEXT, subtotal REAL NOT NULL DEFAULT 0, desconto REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0, obs TEXT, venda_id INTEGER, os_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE orcamento_itens(
  id INTEGER PRIMARY KEY, orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id), tipo TEXT NOT NULL DEFAULT 'peca',
  produto_id INTEGER REFERENCES produtos(id), descricao TEXT NOT NULL, unidade TEXT, qtd REAL NOT NULL, unitario REAL NOT NULL,
  custo REAL NOT NULL DEFAULT 0, total REAL NOT NULL);
CREATE INDEX ix_oi_orc ON orcamento_itens(orcamento_id);
CREATE TABLE os(
  id INTEGER PRIMARY KEY, numero INTEGER UNIQUE NOT NULL, cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  equipamento_id INTEGER REFERENCES equipamentos(id), tecnico_id INTEGER REFERENCES users(id), tipo TEXT NOT NULL DEFAULT 'corretiva',
  status TEXT NOT NULL DEFAULT 'aberta', agendada_para TEXT, descricao TEXT, laudo TEXT, checklist TEXT, assinatura TEXT, assinatura_nome TEXT,
  total REAL NOT NULL DEFAULT 0, orcamento_id INTEGER, faturada_forma TEXT, created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), concluida_em TEXT);
CREATE TABLE os_itens(
  id INTEGER PRIMARY KEY, os_id INTEGER NOT NULL REFERENCES os(id), tipo TEXT NOT NULL DEFAULT 'peca', produto_id INTEGER REFERENCES produtos(id),
  descricao TEXT NOT NULL, unidade TEXT, qtd REAL NOT NULL, unitario REAL NOT NULL, custo REAL NOT NULL DEFAULT 0, total REAL NOT NULL, cilindro_id INTEGER);
CREATE INDEX ix_osi_os ON os_itens(os_id);
CREATE TABLE os_fotos(id INTEGER PRIMARY KEY, os_id INTEGER NOT NULL REFERENCES os(id), legenda TEXT, mime TEXT, data BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE lancamentos(
  id INTEGER PRIMARY KEY, tipo TEXT NOT NULL CHECK(tipo IN('receber','pagar')), descricao TEXT NOT NULL, valor REAL NOT NULL,
  vencimento TEXT, pago INTEGER NOT NULL DEFAULT 0, pago_em TEXT, forma TEXT, origem TEXT, origem_id INTEGER, cliente_id INTEGER,
  pessoa TEXT, cancelado INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX ix_lanc_venc ON lancamentos(vencimento); CREATE INDEX ix_lanc_pago ON lancamentos(pago_em);
`;

const DEFAULT_SETTINGS = {
  loja_nome: 'Minha Loja de Refrigeração', loja_doc: '', loja_telefone: '', loja_endereco: '', loja_logo: '',
  margem_padrao: '60', validade_dias: '10', manut_meses: '6', estoque_negativo: '0',
  msg_orcamento: 'Olá, {cliente}! Segue o orçamento nº {numero} da {loja}.\nTotal: {total}\nVálido até {validade}.\nQualquer dúvida é só responder por aqui.',
  msg_manutencao: 'Olá, {cliente}! Aqui é da {loja}. Já faz um tempo desde a última manutenção do seu ar-condicionado. Que tal agendar uma limpeza preventiva?',
  // impressora térmica (cupom não fiscal)
  impressora_modo: 'desligada', impressora_nome: '', impressora_ip: '', impressora_porta: '9100', impressora_colunas: '48', impressora_codepage: '850',
  impressora_corte: '1', impressora_gaveta: '0', impressora_auto: '0', cupom_rodape: 'Obrigado pela preferência!\nVolte sempre!',
  // cópia externa do backup (pasta no pendrive/Drive); ultimo/erro são gravados só pelo servidor
  backup_externo_pasta: '', backup_externo_ultimo: '', backup_externo_erro: '',
};

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
}
function verifyPassword(pw, salt, hash) {
  try { return crypto.timingSafeEqual(crypto.scryptSync(String(pw), salt, 64), Buffer.from(hash, 'hex')); } catch { return false; }
}

function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'friogest.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (db.pragma('user_version', { simple: true }) < 1) {
    db.exec(SCHEMA);
    db.pragma('user_version = 1');
  }
  if (db.pragma('user_version', { simple: true }) < 2) { // v2: folha de serviço da OS (endereço do atendimento, instruções, prioridade)
    for (const c of ['atend_endereco', 'atend_bairro', 'atend_complemento', 'atend_referencia', 'atend_contato', 'atend_telefone', 'instrucoes']) {
      try { db.exec('ALTER TABLE os ADD COLUMN ' + c + ' TEXT'); } catch { /* já existe */ }
    }
    try { db.exec("ALTER TABLE os ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal'"); } catch { /* já existe */ }
    db.pragma('user_version = 2');
  }
  if (db.pragma('user_version', { simple: true }) < 3) { // v3: contas recorrentes (aluguel, luz, internet…)
    db.exec(`CREATE TABLE IF NOT EXISTS recorrencias(
      id INTEGER PRIMARY KEY, tipo TEXT NOT NULL DEFAULT 'pagar', descricao TEXT NOT NULL, valor REAL NOT NULL, dia INTEGER NOT NULL DEFAULT 5,
      pessoa TEXT, ativo INTEGER NOT NULL DEFAULT 1, ultimo_mes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`);
    db.pragma('user_version = 3');
  }
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    const { salt, hash } = hashPassword('master123');
    db.prepare(`INSERT INTO users(username,nome,role,pass_hash,pass_salt,must_change) VALUES('master','Administrador (Master)','master',?,?,1)`).run(hash, salt);
  }
  return { db, file };
}

function loadExample(db) {
  const has = db.prepare('SELECT COUNT(*) n FROM produtos').pluck().get();
  if (has > 0) return false;
  const P = db.prepare(`INSERT INTO produtos(codigo,cod_fabricante,descricao,unidade,tipo,custo,preco,estoque,minimo,gas_tipo,cilindro_kg,controla_serie) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rows = [
    ['CAP-001', 'EP-35-5', 'Capacitor 35+5 µF 440V', 'un', 'peca', 21.4, 48, 14, 5, null, null, 0],
    ['CAP-002', 'CAP-25', 'Capacitor 25+2,5 µF 440V', 'un', 'peca', 18, 42, 8, 4, null, null, 0],
    ['GAS-410', 'R410A-KG', 'Gás refrigerante R-410A (kg)', 'kg', 'peca', 53.8, 95, 0, 10, 'R-410A', 11.34, 0],
    ['GAS-32', 'R32-KG', 'Gás refrigerante R-32 (kg)', 'kg', 'peca', 62, 110, 0, 8, 'R-32', 11.3, 0],
    ['GAS-22', 'R22-KG', 'Gás refrigerante R-22 (kg)', 'kg', 'peca', 70, 120, 0, 10, 'R-22', 13.6, 0],
    ['CU-14', 'CU-14', 'Tubo de cobre 1/4" flexível (metro)', 'm', 'peca', 15.9, 32, 90, 30, null, null, 0],
    ['CU-38', 'CU-38', 'Tubo de cobre 3/8" flexível (metro)', 'm', 'peca', 24, 48, 60, 30, null, null, 0],
    ['CU-58', 'CU-58', 'Tubo de cobre 5/8" flexível (metro)', 'm', 'peca', 38, 72, 45, 30, null, null, 0],
    ['SP-400', 'SP-400', 'Suporte para condensadora 400 mm', 'un', 'peca', 38, 69.9, 12, 4, null, null, 0],
    ['SP-500', 'SP-500', 'Suporte para condensadora 500 mm', 'un', 'peca', 49, 89.9, 9, 4, null, null, 0],
    ['FT-PVC', 'FT-PVC', 'Fita PVC branca 10 m', 'un', 'peca', 3.1, 7.5, 40, 10, null, null, 0],
    ['ISO-38', 'ISO-38', 'Isolamento esponjoso 3/8" 2 m', 'un', 'peca', 4.9, 9.9, 40, 10, null, null, 0],
    ['CT-32', 'CT-32A', 'Contator 32A bobina 220V', 'un', 'peca', 54, 98, 10, 3, null, null, 0],
    ['CMP-12', 'CMP-ROT-12', 'Compressor rotativo 12.000 BTUs R-410A', 'un', 'peca', 980, 1490, 2, 1, null, null, 1],
    ['SPL-24', 'SPL-INV-24', 'Split Inverter 24.000 BTUs R-32', 'un', 'peca', 1700, 2290, 3, 1, null, null, 1],
    ['SPL-12', 'SPL-INV-12', 'Split Inverter 12.000 BTUs R-32', 'un', 'peca', 1180, 1590, 4, 1, null, null, 1],
    ['KIT-24', 'KIT-24K', 'Kit instalação 24k (tubo 5 m, cabo PP, dreno, fita)', 'un', 'peca', 210, 380, 6, 2, null, null, 0],
    ['SRV-I12', '', 'Instalação split até 12.000 BTUs', 'un', 'servico', 0, 450, 0, 0, null, null, 0],
    ['SRV-I24', '', 'Instalação split até 24.000 BTUs', 'un', 'servico', 0, 550, 0, 0, null, null, 0],
    ['SRV-LIM', '', 'Limpeza / higienização de split', 'un', 'servico', 0, 180, 0, 0, null, null, 0],
    ['SRV-COR', '', 'Manutenção corretiva (mão de obra)', 'un', 'servico', 0, 180, 0, 0, null, null, 0],
    ['SRV-GAS', '', 'Carga de gás (mão de obra)', 'un', 'servico', 0, 90, 0, 0, null, null, 0],
    ['SRV-VIS', '', 'Visita técnica', 'un', 'servico', 0, 90, 0, 0, null, null, 0],
  ];
  const tx = db.transaction(() => {
    rows.forEach(r => P.run(...r));
    const C = db.prepare('INSERT INTO clientes(nome,doc,telefone,endereco) VALUES(?,?,?,?)');
    const c1 = C.run('Marcos Andrade', '123.456.789-00', '(21) 99812-4471', 'Rua das Acácias, 120').lastInsertRowid;
    const c2 = C.run('Padaria Pão Quente', '12.345.678/0001-90', '(21) 98877-1020', 'Av. Principal, 450 - Centro').lastInsertRowid;
    const c3 = C.run('Clínica Vida', '98.765.432/0001-10', '(21) 3333-4545', 'Rua da Saúde, 33').lastInsertRowid;
    const E = db.prepare('INSERT INTO equipamentos(cliente_id,marca,modelo,btus,serie,local_instalacao,garantia_ate) VALUES(?,?,?,?,?,?,?)');
    E.run(c1, 'Samsung', 'Split Hi-Wall', 9000, 'SMS9-1180', 'Sala', null);
    E.run(c2, 'LG', 'Dual Inverter', 24000, 'LG24-5521', 'Salão', null);
    E.run(c3, 'Midea', 'Split Hi-Wall', 12000, 'SPL12-2291-0457', 'Sala 3', '2027-03-31');
    const Z = db.prepare('INSERT INTO cilindros(numero,gas_tipo,capacidade_kg,saldo_kg,local) VALUES(?,?,?,?,?)');
    Z.run('C-0007', 'R-410A', 11.34, 4.3, 'Loja'); Z.run('C-0008', 'R-410A', 11.34, 11.34, 'Depósito');
    Z.run('C-0004', 'R-32', 11.3, 5.8, 'Carro - Carlos'); Z.run('C-0005', 'R-32', 11.3, 11.3, 'Loja');
    Z.run('C-0002', 'R-22', 13.6, 6.2, 'Loja');
    for (const t of ['R-410A', 'R-32', 'R-22'])
      db.prepare(`UPDATE produtos SET estoque=(SELECT COALESCE(SUM(saldo_kg),0) FROM cilindros WHERE gas_tipo=? AND ativo=1) WHERE gas_tipo=?`).run(t, t);
  });
  tx();
  return true;
}

module.exports = { open, hashPassword, verifyPassword, loadExample, DEFAULT_SETTINGS };
