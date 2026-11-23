'use strict';
// Popula um FrioGest em execução com dados de teste realistas (clientes, produtos, gás, vendas, orçamentos, OS, financeiro).
// Usa a própria API, então tudo passa pelas mesmas regras e aparece na auditoria.
//
//   1) suba o sistema:   npm run dev            (ou abra o app)
//   2) rode:             SEED_PASS=suaSenhaDoMaster npm run seed
//      ou, sem digitar senha no terminal:  npm run seed:browser   (abre o Chrome, você faz o login nele e o seed roda com essa sessão)
//
// Variáveis: SEED_URL (padrão http://127.0.0.1:3210) · SEED_USER (padrão master) · SEED_PASS (senha do master)
//            FORCE=1 para semear mesmo que já existam clientes/produtos.
// Usuários criados: carlos.vendedor, joao.tecnico, sandra.supervisora — senha provisória "teste123" (pedem troca no 1º acesso).
let BASE = '';
let cookie = '';
let QUIET = false;

async function api(method, url, body) {
  const res = await fetch(BASE + '/api' + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'friogest', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const txt = await res.text(); let data; try { data = JSON.parse(txt); } catch { data = txt; }
  if (!res.ok) { const e = new Error(`${method} ${url} → ${res.status}: ${data?.error || data?.message || txt}`); e.status = res.status; e.data = data; throw e; }
  return data;
}
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const hora = (n, h = 9) => `${dia(n)}T${String(h).padStart(2, '0')}:00`;
const log = (...a) => { if (!QUIET) console.log(...a); };

/** Semeia os dados de teste. opts: { base, cookie?, user?, pass?, force?, quiet? } — lança erro se algo falhar. */
async function seed(opts = {}) {
  BASE = String(opts.base || process.env.SEED_URL || 'http://127.0.0.1:3210').replace(/\/$/, ''); cookie = opts.cookie || process.env.SEED_COOKIE || ''; QUIET = !!opts.quiet;
  try { await fetch(BASE + '/api/info'); } catch { throw new Error(`Não consegui falar com ${BASE}. Suba o sistema antes (npm run dev).`); }
  const user = opts.user || process.env.SEED_USER || 'master', pass = opts.pass || process.env.SEED_PASS || 'master123';
  if (!cookie) {
    try { await api('POST', '/login', { username: user, password: pass }); }
    catch (e) { throw new Error(`Login falhou (${e.message}). Informe a senha: SEED_PASS=... npm run seed`); }
  }
  const me = await api('GET', '/me');
  if (me.user.must_change) throw new Error('Este usuário ainda precisa trocar a senha provisória. Entre no sistema, troque a senha e rode o seed com a senha nova.');
  if (!(opts.force || process.env.FORCE) && ((await api('GET', '/clientes')).length || (await api('GET', '/produtos?limit=1')).length)) {
    throw new Error('Já existem clientes/produtos neste banco. Use FORCE=1 se quiser semear mesmo assim.');
  }

  // ---------- loja
  log('• Dados da loja');
  await api('PUT', '/config', { loja_nome: 'Gelo Frio Refrigeração', loja_doc: '12.345.678/0001-90', loja_telefone: '(21) 3333-4444', loja_endereco: 'Av. das Américas, 1500 - Barra da Tijuca, Rio de Janeiro/RJ' }).catch(e => log('  (config ignorada:', e.message + ')'));

  // ---------- equipe
  log('• Equipe');
  const equipe = [['carlos.vendedor', 'Carlos Vendedor', 'vendedor', 5], ['joao.tecnico', 'João Técnico', 'tecnico', 0], ['sandra.supervisora', 'Sandra Supervisora', 'supervisor', 2]];
  const ids = {};
  for (const [username, nome, role, comissao_pct] of equipe) {
    try { ids[username] = (await api('POST', '/usuarios', { username, nome, role, comissao_pct, senha: 'teste123', telefone: '(21) 9' + Math.floor(1e7 + Math.random() * 9e7) })).id; }
    catch (e) { const u = (await api('GET', '/usuarios')).find(x => x.username === username); if (!u) throw e; ids[username] = u.id; }
  }

  // ---------- clientes + equipamentos
  log('• Clientes e equipamentos');
  const clientesDef = [
    ['Maria das Dores Silva', '123.456.789-09', '(21) 99876-5432', 'maria.dores@email.com', 'Rua das Flores, 100 - Tijuca, Rio de Janeiro', [['Samsung', 'WindFree 12000', 12000, 'SN-A1001', 'Sala']]],
    ['José Carlos Pereira', '987.654.321-00', '(21) 98765-4321', 'jose.pereira@email.com', 'Av. Brasil, 2500 - Penha, Rio de Janeiro', [['LG', 'Dual Inverter 9000', 9000, 'SN-B2002', 'Quarto casal'], ['LG', 'Dual Inverter 12000', 12000, 'SN-B2003', 'Sala']]],
    ['Padaria Pão Quente Ltda', '11.222.333/0001-44', '(21) 3555-1212', 'contato@paoquente.com.br', 'Rua Conde de Bonfim, 800 - Tijuca', [['Carrier', 'Cassete 36000', 36000, 'SN-C3001', 'Salão'], ['Midea', 'Piso-teto 48000', 48000, 'SN-C3002', 'Cozinha']]],
    ['Clínica Odonto Sorriso', '22.333.444/0001-55', '(21) 3222-9090', 'adm@odontosorriso.com.br', 'Rua Voluntários da Pátria, 45 - Botafogo', [['Daikin', 'Hi Wall 18000', 18000, 'SN-D4001', 'Consultório 1'], ['Daikin', 'Hi Wall 18000', 18000, 'SN-D4002', 'Consultório 2'], ['Daikin', 'Hi Wall 12000', 12000, 'SN-D4003', 'Recepção']]],
    ['Ana Beatriz Souza', '321.654.987-11', '(21) 97766-5544', 'ana.souza@email.com', 'Rua Barão de Mesquita, 300 - Andaraí', [['Springer', 'Midea Inverter 12000', 12000, 'SN-E5001', 'Quarto']]],
    ['Restaurante Sabor da Serra', '33.444.555/0001-66', '(21) 3444-7878', 'gerencia@sabordaserra.com.br', 'Estrada do Pau Ferro, 10 - Jacarepaguá', [['Elgin', 'Split 24000', 24000, 'SN-F6001', 'Salão']]],
    ['Roberto Almeida', '456.789.123-22', '(21) 96655-4433', null, 'Rua Haddock Lobo, 77 - Estácio', []],
    ['Condomínio Edifício Aurora', '44.555.666/0001-77', '(21) 3111-2020', 'sindico@edificioaurora.com.br', 'Rua do Catete, 200 - Catete', [['Fujitsu', 'Split 60000', 60000, 'SN-G7001', 'Salão de festas']]],
  ];
  const C = [];
  for (const [nome, doc, telefone, email, endereco, eqs] of clientesDef) {
    const { id } = await api('POST', '/clientes', { nome, doc, telefone, email, endereco });
    const equip = [];
    for (const [marca, modelo, btus, serie, local_instalacao] of eqs) equip.push((await api('POST', '/equipamentos', { cliente_id: id, marca, modelo, btus, serie, local_instalacao, garantia_ate: dia(200) })).id);
    C.push({ id, nome, equip });
  }

  // ---------- produtos
  log('• Produtos e serviços');
  const prodDef = [
    // [codigo, descricao, unidade, custo, preco, minimo, extra]
    ['CAP35', 'Capacitor 35uF', 'un', 20, 50, 5], ['CAP45', 'Capacitor 45uF', 'un', 24, 60, 5], ['CONT', 'Contatora 25A', 'un', 38, 95, 3],
    ['SENS', 'Sensor de temperatura NTC', 'un', 12, 35, 5], ['PLACA', 'Placa eletrônica universal', 'un', 140, 320, 2],
    ['TUBO14', 'Tubo de cobre 1/4" (metro)', 'm', 18, 38, 30], ['TUBO38', 'Tubo de cobre 3/8" (metro)', 'm', 26, 54, 30],
    ['ISOL', 'Isolamento térmico (metro)', 'm', 4, 10, 40], ['SUP', 'Suporte para condensadora', 'un', 22, 60, 6],
    ['CABO', 'Cabo PP 4x1,5mm (metro)', 'm', 6, 14, 40], ['SPL12', 'Ar-condicionado Split 12000 BTUs Inverter', 'un', 1750, 2390, 2, { controla_serie: true }],
    ['SPL18', 'Ar-condicionado Split 18000 BTUs Inverter', 'un', 2480, 3290, 1, { controla_serie: true }], ['COMP12', 'Compressor rotativo 12000 BTUs', 'un', 480, 890, 1, { controla_serie: true }],
    ['FILTRO', 'Filtro de ar lavável', 'un', 15, 45, 4], ['LIMP', 'Limpeza química de evaporadora', 'un', 40, 120, 0, { tipo: 'servico' }],
    ['SERV1', 'Instalação split até 12000 BTUs', 'un', 0, 380, 0, { tipo: 'servico' }], ['SERV2', 'Instalação split 18000 a 24000 BTUs', 'un', 0, 520, 0, { tipo: 'servico' }],
    ['SERV3', 'Manutenção preventiva', 'un', 0, 150, 0, { tipo: 'servico' }], ['SERV4', 'Visita técnica / diagnóstico', 'un', 0, 90, 0, { tipo: 'servico' }],
    ['GAS410', 'Gás refrigerante R-410A (kg)', 'kg', 52, 120, 0, { gas_tipo: 'R-410A', cilindro_kg: 11.3 }],
    ['GAS32', 'Gás refrigerante R-32 (kg)', 'kg', 60, 135, 0, { gas_tipo: 'R-32', cilindro_kg: 9 }],
    ['GAS22', 'Gás refrigerante R-22 (kg)', 'kg', 70, 150, 0, { gas_tipo: 'R-22', cilindro_kg: 13.6 }],
  ];
  for (const [codigo, descricao, unidade, custo, preco, minimo, extra = {}] of prodDef) await api('POST', '/produtos', { tipo: 'peca', codigo, descricao, unidade, custo, preco, minimo, ...extra });
  const P = {}; (await api('GET', '/produtos?limit=200')).forEach(p => { P[p.codigo] = p; });

  // ---------- entrada de estoque (NF de compra) + gás
  log('• Entrada de estoque e cilindros de gás');
  const comEstoque = { CAP35: 25, CAP45: 20, CONT: 10, SENS: 18, PLACA: 6, TUBO14: 120, TUBO38: 100, ISOL: 200, SUP: 20, CABO: 150, SPL12: 6, SPL18: 3, COMP12: 3, FILTRO: 15 };
  await api('POST', '/estoque/entrada', { fornecedor: 'Distribuidora Frigopeças Ltda', nf_numero: '45871', itens: Object.entries(comEstoque).map(([c, qtd]) => ({ produto_id: P[c].id, qtd, custo: P[c].custo })) });
  await api('POST', '/estoque/entrada', { fornecedor: 'Gases Refrigerantes do Brasil S.A.', nf_numero: '9921', itens: [{ produto_id: P.GAS410.id, qtd: 3, custo: 52 * 11.3 }, { produto_id: P.GAS32.id, qtd: 2, custo: 60 * 9 }, { produto_id: P.GAS22.id, qtd: 1, custo: 70 * 13.6 }] });
  await api('POST', '/cilindros', { gas_tipo: 'R-410A', capacidade_kg: 11.3, saldo_kg: 6.4, local: 'Loja' });
  await api('POST', '/cilindros', { gas_tipo: 'R-410A', capacidade_kg: 11.3, saldo_kg: 8.8, local: 'Veículo' });
  await api('POST', '/lancamentos', { tipo: 'pagar', descricao: 'NF 45871 - Distribuidora Frigopeças (1/2)', valor: 3200, vencimento: dia(12), pessoa: 'Distribuidora Frigopeças Ltda' });
  await api('POST', '/lancamentos', { tipo: 'pagar', descricao: 'NF 45871 - Distribuidora Frigopeças (2/2)', valor: 3200, vencimento: dia(42), pessoa: 'Distribuidora Frigopeças Ltda' });
  const prodAtual = {}; (await api('GET', '/produtos?limit=200')).forEach(p => { prodAtual[p.codigo] = p; });
  Object.assign(P, prodAtual);

  // ---------- vendas
  log('• Vendas');
  const venda = (cli, itens, forma_pgto, extra = {}) => api('POST', '/vendas', { cliente_id: cli?.id, itens: itens.map(([c, qtd, unitario]) => ({ produto_id: P[c].id, qtd, unitario: unitario ?? P[c].preco })), forma_pgto, vencimento: dia(20), ...extra });
  await venda(null, [['CAP35', 2], ['FILTRO', 1]], 'dinheiro');
  await venda(null, [['SENS', 1]], 'pix');
  await venda(C[0], [['CAP45', 1], ['SERV4', 1]], 'credito');
  await venda(C[1], [['SPL12', 1], ['SERV1', 1], ['TUBO14', 3], ['TUBO38', 3], ['ISOL', 3], ['CABO', 4], ['SUP', 1]], 'credito', { desconto_pct: 3 });
  await venda(C[2], [['CONT', 2], ['CAP35', 4]], 'fiado');
  await venda(C[4], [['FILTRO', 2], ['LIMP', 1]], 'pix');
  await venda(C[3], [['SPL18', 2], ['SERV2', 2], ['SUP', 2]], 'boleto', { desconto_valor: 150 });
  await venda(null, [['PLACA', 1]], 'debito');
  const vs = await api('GET', '/vendas'); // devolve 1 item de uma venda para exercitar a devolução
  try { const v = await api('GET', '/vendas/' + vs.find(x => x.cliente === 'Clínica Odonto Sorriso').id); await api('POST', `/vendas/${v.id}/devolver`, { itens: [{ item_id: v.itens[2].id, qtd: 1 }], motivo: 'Suporte com defeito' }); } catch (e) { log('  (devolução de exemplo ignorada:', e.message + ')'); }

  // ---------- orçamentos
  log('• Orçamentos');
  const orc = async (cli, itens, extra = {}) => { const o = await api('POST', '/orcamentos', { cliente_id: cli.id, itens: itens.map(([c, qtd, unitario]) => ({ produto_id: P[c].id, qtd, unitario: unitario ?? P[c].preco })), ...extra }); return o; };
  const o1 = await orc(C[5], [['SPL18', 1], ['SERV2', 1], ['TUBO38', 4], ['ISOL', 4], ['SUP', 1]]);            // fica em aberto
  const o2 = await orc(C[7], [['SPL18', 2], ['SERV2', 2], ['GAS410', 2]], { desconto_pct: 5 });                 // aprovado → vira OS
  const o3 = await orc(C[6], [['SPL12', 1], ['SERV1', 1]]);                                                    // recusado
  const o4 = await orc(C[4], [['LIMP', 1], ['GAS410', 1]]);                                                    // aprovado → vira venda
  await api('POST', `/orcamentos/${o2.id}/status`, { status: 'aprovado' });
  await api('POST', `/orcamentos/${o3.id}/status`, { status: 'recusado' });
  await api('POST', `/orcamentos/${o4.id}/status`, { status: 'aprovado' });
  const osDoOrc = await api('POST', `/orcamentos/${o2.id}/converter`, { para: 'os', tipo: 'instalacao', tecnico_id: ids['joao.tecnico'], equipamento_id: null, agendada_para: hora(2, 8) });
  await api('POST', `/orcamentos/${o4.id}/converter`, { para: 'venda', forma_pgto: 'pix' }).catch(e => log('  (conversão em venda ignorada:', e.message + ')'));

  // ---------- ordens de serviço
  log('• Ordens de serviço');
  const novaOS = (cli, eq, tipo, tec, descricao, itens, ag) => api('POST', '/os', { cliente_id: cli.id, equipamento_id: eq || null, tipo, tecnico_id: tec, descricao, agendada_para: ag || null, itens: itens.map(([c, qtd, unitario]) => ({ produto_id: P[c].id, qtd, unitario: unitario ?? P[c].preco })) });
  const tec = ids['joao.tecnico'];
  const osA = await novaOS(C[3], C[3].equip[0], 'preventiva', tec, 'Manutenção preventiva trimestral dos 3 aparelhos', [['SERV3', 3], ['FILTRO', 3]], hora(-1, 14));
  await api('POST', `/os/${osA.id}/status`, { status: 'em_andamento' });
  await api('POST', `/os/${osA.id}/concluir`, { laudo: 'Limpeza realizada, filtros trocados. Equipamentos funcionando normalmente.', assinatura_nome: 'Dra. Patrícia' });
  await api('POST', `/os/${osA.id}/faturar`, { forma_pgto: 'pix' });
  const osB = await novaOS(C[2], C[2].equip[0], 'corretiva', tec, 'Não gela. Suspeita de falta de gás.', [['SERV4', 1], ['GAS410', 2], ['CAP45', 1]], hora(-3, 10));
  await api('POST', `/os/${osB.id}/status`, { status: 'em_andamento' });
  await api('POST', `/os/${osB.id}/concluir`, { laudo: 'Vazamento na união da evaporadora corrigido; recarga de gás e troca do capacitor.', assinatura_nome: 'Gerente da padaria' });   // concluída, ainda sem faturar
  const osC = await novaOS(C[1], C[1].equip[0], 'instalacao', tec, 'Instalação de split no quarto', [['SERV1', 1], ['TUBO14', 3], ['ISOL', 3], ['SUP', 1]], hora(1, 9));   // agendada
  await novaOS(C[0], C[0].equip[0], 'corretiva', tec, 'Ar pingando água dentro de casa', [['SERV4', 1]]);                                                                       // aberta
  await novaOS(C[5], C[5].equip[0], 'preventiva', ids['joao.tecnico'], 'Revisão anual do split do salão', [['SERV3', 1]], hora(5, 15));
  log(`  OS criadas: ${osA.numero}, ${osB.numero}, ${osC.numero}, ${osDoOrc?.numero ?? '?'} e mais 2`);

  // ---------- financeiro
  log('• Financeiro');
  await api('POST', '/lancamentos', { tipo: 'pagar', descricao: 'Aluguel da loja', valor: 4200, vencimento: dia(-2), pessoa: 'Imobiliária Central' });          // vencido
  await api('POST', '/lancamentos', { tipo: 'pagar', descricao: 'Energia elétrica', valor: 780.5, vencimento: dia(6), pessoa: 'Light' });
  await api('POST', '/lancamentos', { tipo: 'pagar', descricao: 'Combustível do veículo', valor: 350, vencimento: dia(0), pessoa: 'Posto Ipiranga', pago: true, forma: 'dinheiro' });
  await api('POST', '/lancamentos', { tipo: 'receber', descricao: 'Serviço avulso — Condomínio Aurora (vencido)', valor: 900, vencimento: dia(-8), cliente_id: C[7].id });

  const r = { clientes: (await api('GET', '/clientes')).length, produtos: (await api('GET', '/produtos?limit=200')).length, vendas: (await api('GET', '/vendas')).length, orcamentos: (await api('GET', '/orcamentos')).length, os: (await api('GET', '/os')).length };
  log('\n✓ Dados de teste criados:', JSON.stringify(r));
  log('  Usuários extras (senha provisória "teste123"): carlos.vendedor · joao.tecnico · sandra.supervisora');
  return r;
}

module.exports = { seed };
if (require.main === module) seed().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
