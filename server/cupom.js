'use strict';
// Monta os cupons NÃO FISCAIS (venda, OS, orçamento, teste) em ESC/POS.
const { Cupom } = require('./escpos');
const { brl } = require('./services');

const fdate = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
const fdt = s => (s ? `${fdate(s)} ${String(s).slice(11, 16)}` : '');
const qtdf = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const money = n => brl(n).replace(/ /g, ' ');
const FORMA_LABEL = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro', fiado: 'Fiado', boleto: 'Boleto' };
const TIPO_OS = { instalacao: 'Instalação', corretiva: 'Manutenção corretiva', preventiva: 'Manutenção preventiva', visita: 'Visita técnica', outro: 'Outro' };

/** Lê as configurações da impressora a partir da tabela settings. */
function configImpressora(S, extra = {}) {
  const g = k => S.setting(k) || '';
  // Bematech MP-4200 TH imprime 42 colunas por linha: se a largura ficou no padrão (48), usa 42 para não cortar o texto
  let colunas = +g('impressora_colunas') || 48;
  if (colunas === 48 && /mp-?4200/i.test(g('impressora_nome'))) colunas = 42;
  return {
    modo: g('impressora_modo') || 'desligada', nome: g('impressora_nome'), ip: g('impressora_ip'), porta: +g('impressora_porta') || 9100,
    colunas, codepage: +g('impressora_codepage') || 850, corte: g('impressora_corte') !== '0', gaveta: g('impressora_gaveta') === '1',
    auto: g('impressora_auto') === '1', rodape: g('cupom_rodape'), ...extra,
  };
}

function cabecalho(c, S, titulo) {
  const g = k => S.setting(k) || '';
  c.align('center').bold(true).size(2, 2).text(g('loja_nome') || 'FrioGest', Math.floor(c.w / 2)).normal().align('center');
  if (g('loja_doc')) c.line('CNPJ/CPF: ' + g('loja_doc'));
  if (g('loja_endereco')) c.text(g('loja_endereco')); // o alinhamento central é feito pela impressora (ESC a 1)
  if (g('loja_telefone')) c.line('Tel.: ' + g('loja_telefone'));
  c.align('left').hr('=');
  c.align('center').bold(true).line(titulo).bold(false).align('left');
}

function rodape(c, cfg, extra) {
  c.hr();
  c.align('center');
  if (extra) c.text(extra);
  if (cfg.rodape) c.text(cfg.rodape);
  c.line('Cupom sem valor fiscal').align('left');
  if (cfg.gaveta) c.drawer();
  if (cfg.corte) c.cut(4); else c.feed(4);
}

function itensVenda(c, itens) {
  itens.forEach((i, n) => {
    c.text(`${String(n + 1).padStart(2, '0')} ${i.descricao}`);
    c.lr(`   ${qtdf(i.qtd)} ${i.unidade || ''} x ${money(i.unitario)}`, money(i.total));
  });
}

function totais(c, o) {
  c.hr();
  c.lr('Subtotal', money(o.subtotal));
  if (o.desconto > 0) c.lr('Desconto', '- ' + money(o.desconto));
  c.bold(true).size(1, 2).lr('TOTAL', money(o.total)).normal();
}

/** v: venda com cliente/vendedor, itens: venda_itens */
function cupomVenda(cfg, S, v, itens) {
  const c = new Cupom(cfg);
  cabecalho(c, S, `CUPOM DE VENDA Nº ${v.numero}`);
  if (v.status === 'cancelada') c.align('center').bold(true).line('*** CANCELADA ***').bold(false).align('left');
  c.line(fdt(v.created_at));
  c.text(`Cliente: ${v.cliente || 'Consumidor'}`);
  if (v.vendedor) c.text(`Vendedor: ${v.vendedor}`);
  c.hr();
  itensVenda(c, itens);
  totais(c, v);
  c.lr('Pagamento', FORMA_LABEL[v.forma_pgto] || v.forma_pgto || '');
  rodape(c, cfg);
  return c.bytes();
}

function cupomOrcamento(cfg, S, o, itens) {
  const c = new Cupom(cfg);
  cabecalho(c, S, `ORÇAMENTO Nº ${o.numero}`);
  c.line(`Emitido em ${fdate(o.created_at)}  ·  Válido até ${fdate(o.validade)}`);
  c.text(`Cliente: ${o.cliente || 'Consumidor'}`);
  if (o.cliente_tel) c.line('Tel.: ' + o.cliente_tel);
  c.hr();
  itensVenda(c, itens);
  totais(c, o);
  if (o.obs) { c.hr(); c.text('Obs.: ' + o.obs); }
  rodape(c, cfg, 'Orçamento sujeito a alteração após a validade.');
  return c.bytes();
}

function cupomOS(cfg, S, o, itens) {
  const c = new Cupom(cfg);
  cabecalho(c, S, `ORDEM DE SERVIÇO Nº ${o.numero}`);
  c.line(`${TIPO_OS[o.tipo] || o.tipo}  ·  ${fdate(o.created_at)}`);
  c.text(`Cliente: ${o.cliente}`);
  if (o.cliente_tel) c.line('Tel.: ' + o.cliente_tel);
  if (o.cliente_end) c.text('End.: ' + o.cliente_end);
  if (o.tecnico) c.text('Técnico: ' + o.tecnico);
  if (o.eq_marca) c.text(`Equip.: ${o.eq_marca} ${o.eq_modelo || ''} ${o.eq_btus ? o.eq_btus + ' BTUs' : ''}`.replace(/\s+/g, ' ').trim());
  if (o.descricao) { c.hr(); c.text('Solicitação: ' + o.descricao); }
  if (itens.length) { c.hr(); itensVenda(c, itens); c.hr(); c.bold(true).size(1, 2).lr('TOTAL', money(o.total)).normal(); }
  if (o.laudo) { c.hr(); c.text('Laudo: ' + o.laudo); }
  rodape(c, cfg);
  return c.bytes();
}

function cupomTeste(cfg, S) {
  const c = new Cupom(cfg);
  cabecalho(c, S, 'TESTE DE IMPRESSÃO');
  const agora = new Date(), p2 = n => String(n).padStart(2, '0'); // hora LOCAL (toISOString daria UTC, 3 h à frente)
  c.line(fdt(`${agora.getFullYear()}-${p2(agora.getMonth() + 1)}-${p2(agora.getDate())} ${p2(agora.getHours())}:${p2(agora.getMinutes())}`));
  c.hr();
  c.text('Acentuação: áéíóú àâêôç ãõ ÁÉÍÓÚ ÃÕ Ç');
  c.text('Moeda: R$ 1.234,56  ·  12% de desconto');
  c.line('Largura: ' + c.w + ' colunas');
  c.line('0123456789'.repeat(Math.ceil(c.w / 10)).slice(0, c.w));
  c.bold(true).line('Negrito').bold(false).size(2, 2).line('Grande').normal();
  c.align('center').qr('https://friogest.local/teste', 5).align('left');
  rodape(c, cfg, 'Se você leu este cupom, a impressora está integrada.');
  return c.bytes();
}

module.exports = { configImpressora, cupomVenda, cupomOrcamento, cupomOS, cupomTeste };
