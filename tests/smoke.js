'use strict';
// Teste de ponta a ponta da API (roda com: npm test)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-test-'));
const srv = createServer({ dataDir: dir, backupDir: path.join(dir, 'backups'), publicDir: path.join(__dirname, '..', 'public'), readNet: () => ({ lan: false, port: 3210 }), writeNet: () => {} });
let BASE; let passed = 0;

class Client {
  constructor() { this.cookie = ''; }
  async call(method, url, body, { raw = false, csrf = true } = {}) {
    const res = await fetch(BASE + url, {
      method, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Requested-With': 'friogest' } : {}), Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    if (raw) return res;
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    return { status: res.status, data };
  }
  get(u) { return this.call('GET', u); }
  post(u, b) { return this.call('POST', u, b ?? {}); }
  put(u, b) { return this.call('PUT', u, b ?? {}); }
}
const ok = r => { assert.ok(r.status >= 200 && r.status < 300, `esperava sucesso, veio ${r.status}: ${JSON.stringify(r.data)}`); return r.data; };
const fail = (r, status, msg) => { assert.strictEqual(r.status, status, `esperava ${status}, veio ${r.status}: ${JSON.stringify(r.data)}`); if (msg) assert.ok(String(r.data.erro).includes(msg), `mensagem "${r.data.erro}" não contém "${msg}"`); };
const test = async (nome, fn) => { try { await fn(); passed++; console.log('  ✓', nome); } catch (e) { console.error('  ✗', nome, '\n   ', e.message); process.exitCode = 1; throw e; } };

(async () => {
  const { port } = await srv.listen(40000 + Math.floor(Math.random() * 20000), '127.0.0.1');
  BASE = `http://127.0.0.1:${port}`;
  const master = new Client(), sup = new Client(), vend = new Client(), tec = new Client(), anon = new Client();

  await test('login do master com senha padrão exige troca de senha', async () => {
    fail(await master.post('/api/login', { username: 'master', password: 'errada' }), 401);
    const l = ok(await master.post('/api/login', { username: 'master', password: 'master123' }));
    assert.strictEqual(l.user.role, 'master'); assert.strictEqual(l.user.must_change, true);
    fail(await master.get('/api/produtos'), 403, 'Troque a senha');
    fail(await master.post('/api/me/senha', { atual: 'master123', nova: '123' }), 400);
    ok(await master.post('/api/me/senha', { atual: 'master123', nova: 'Master@2026' }));
    ok(await master.get('/api/produtos'));
  });

  await test('requisição sem sessão ou sem cabeçalho anti-CSRF é recusada', async () => {
    fail(await anon.get('/api/produtos'), 401);
    fail(await master.call('POST', '/api/clientes', { nome: 'x' }, { csrf: false }), 403);
  });

  await test('master cria usuários de cada perfil', async () => {
    for (const [username, nome, role, comissao] of [['ana', 'Ana Supervisora', 'supervisor', 0], ['joao', 'João Balcão', 'vendedor', 3], ['carlos', 'Carlos Técnico', 'tecnico', 0]])
      ok(await master.post('/api/usuarios', { username, nome, role, senha: 'senha123', comissao_pct: comissao }));
    fail(await master.post('/api/usuarios', { username: 'ana', nome: 'x', role: 'vendedor', senha: 'senha123' }), 400, 'Já existe');
    fail(await master.post('/api/usuarios', { username: 'zé', nome: 'x', role: 'vendedor', senha: 'senha123' }), 400);
    fail(await master.post('/api/usuarios', { username: 'novo', nome: 'x', role: 'vendedor', senha: '123' }), 400, '6 caracteres');
    assert.strictEqual(ok(await master.get('/api/usuarios')).length, 4);
  });

  await test('master principal não pode ser desativado nem rebaixado', async () => {
    fail(await master.put('/api/usuarios/1', { ativo: false }), 400);
    fail(await master.put('/api/usuarios/1', { role: 'supervisor' }), 400);
  });

  await test('novos usuários trocam a senha no primeiro acesso', async () => {
    for (const [c, u] of [[sup, 'ana'], [vend, 'joao'], [tec, 'carlos']]) {
      assert.strictEqual(ok(await c.post('/api/login', { username: u, password: 'senha123' })).user.must_change, true);
      ok(await c.post('/api/me/senha', { atual: 'senha123', nova: 'nova-' + u + '1' }));
    }
  });

  await test('dados de exemplo carregam uma única vez', async () => {
    ok(await master.post('/api/config/exemplo'));
    fail(await master.post('/api/config/exemplo'), 400);
    assert.ok(ok(await master.get('/api/produtos')).length >= 20);
  });

  await test('permissões por perfil', async () => {
    fail(await vend.get('/api/usuarios'), 403);
    fail(await sup.get('/api/usuarios'), 403);
    fail(await vend.get('/api/relatorios/lucro'), 403);
    fail(await vend.get('/api/lancamentos'), 403);
    fail(await tec.post('/api/vendas', { itens: [{ produto_id: 1, qtd: 1 }] }), 403);
    fail(await vend.put('/api/config', { loja_nome: 'x' }), 403);
    fail(await sup.put('/api/config', { loja_nome: 'x' }), 403);
    const p = ok(await vend.get('/api/produtos'))[0];
    assert.ok(!('custo' in p), 'vendedor não pode ver o custo');
    assert.ok('custo' in ok(await sup.get('/api/produtos'))[0]);
    ok(await master.put('/api/config', { loja_nome: 'Gelo & Cia Refrigeração', loja_telefone: '(21) 3000-0000' }));
  });

  const prod = async q => ok(await master.get('/api/produtos?q=' + encodeURIComponent(q)))[0];
  let cap, gas, tubo, cliente;
  await test('estoque: ajuste manual e histórico', async () => {
    cap = await prod('Capacitor 35+5'); gas = await prod('Gás refrigerante R-410A'); tubo = await prod('Tubo de cobre 1/4');
    assert.strictEqual(cap.estoque, 14);
    ok(await sup.post('/api/estoque/ajuste', { produto_id: cap.id, qtd: 10, motivo: 'ajuste', obs: 'contagem' }));
    assert.strictEqual((await prod('Capacitor 35+5')).estoque, 24);
    fail(await sup.post('/api/estoque/ajuste', { produto_id: cap.id, qtd: -100, motivo: 'perda' }), 400, 'Estoque insuficiente');
    fail(await sup.post('/api/estoque/ajuste', { produto_id: gas.id, qtd: 1 }), 400, 'cilindro');
    const mov = ok(await sup.get(`/api/movimentacoes?produto_id=${cap.id}`));
    assert.strictEqual(mov[0].qtd, 10); assert.strictEqual(mov[0].saldo_apos, 24);
  });

  await test('entrada por XML da NF-e: leitura, vínculo, cilindros e contas a pagar', async () => {
    const xml = fs.readFileSync(path.join(__dirname, 'sample-nfe.xml'), 'utf8');
    const pv = ok(await sup.post('/api/estoque/nfe/preview', { xml }));
    assert.strictEqual(pv.fornecedor, 'Distribuidora Frio Sul Ltda'); assert.strictEqual(pv.nf_numero, '48213');
    assert.strictEqual(pv.itens.length, 4); assert.strictEqual(pv.parcelas.length, 2);
    assert.ok(pv.itens[0].produto_id, 'capacitor vinculado pelo código de fábrica');
    assert.ok(pv.itens[1].produto && pv.itens[1].produto.gas_tipo === 'R-410A', 'gás vinculado');
    assert.strictEqual(pv.itens[3].produto_id, null);
    assert.strictEqual(pv.itens[0].preco_sugerido, 34.24);
    fail(await sup.post('/api/estoque/nfe/preview', { xml: '<a>nada</a>' }), 400, 'NF-e');
    const body = {
      fornecedor: pv.fornecedor, nf_numero: pv.nf_numero, chave: pv.chave, parcelas: pv.parcelas,
      itens: pv.itens.map(i => i.produto_id ? { produto_id: i.produto_id, qtd: i.qtd, custo: i.custo } :
        { novo: { descricao: i.descricao_nf, cod_fabricante: i.cod_fabricante, unidade: i.unidade, minimo: 2 }, qtd: i.qtd, custo: i.custo, preco: i.preco_sugerido }),
    };
    const e = ok(await sup.post('/api/estoque/entrada', body));
    assert.strictEqual(e.total, 3880);
    fail(await sup.post('/api/estoque/entrada', body), 400, 'já foi lançada');
    assert.strictEqual((await prod('Capacitor 35+5')).estoque, 54);
    assert.ok(Math.abs((await prod('Gás refrigerante R-410A')).estoque - (4.3 + 11.34 + 2 * 11.34)) < 0.01, 'gás = soma dos cilindros');
    assert.strictEqual((await prod('PLACA UNIVERSAL')).estoque, 5);
    const pagar = ok(await sup.get('/api/lancamentos?tipo=pagar&situacao=abertos'));
    assert.strictEqual(pagar.length, 2); assert.strictEqual(pagar[0].valor, 1940);
    assert.strictEqual(ok(await sup.get('/api/cilindros')).filter(c => c.gas_tipo === 'R-410A').length, 4);
  });

  let venda;
  await test('venda no balcão: baixa de estoque, gás por cilindro e recebimento', async () => {
    cliente = ok(await vend.get('/api/clientes?q=Marcos'))[0];
    const cil = ok(await vend.get('/api/cilindros')).find(c => c.numero === 'C-0007');
    const antes = (await prod('Gás refrigerante R-410A')).estoque;
    venda = ok(await vend.post('/api/vendas', {
      cliente_id: cliente.id, forma_pgto: 'pix', desconto_pct: 5,
      itens: [{ produto_id: cap.id, qtd: 2 }, { produto_id: gas.id, qtd: 1.5, cilindro_id: cil.id }, { produto_id: tubo.id, qtd: 5 }],
    }));
    assert.strictEqual(venda.total, r2(398.5 - r2(398.5 * 5 / 100)));
    assert.strictEqual((await prod('Capacitor 35+5')).estoque, 52);
    assert.ok(Math.abs((await prod('Gás refrigerante R-410A')).estoque - (antes - 1.5)) < 0.01);
    assert.strictEqual(ok(await vend.get('/api/cilindros')).find(c => c.numero === 'C-0007').saldo_kg, 2.8);
    const cx = ok(await sup.get('/api/caixa'));
    assert.strictEqual(cx.entradas, venda.total); assert.strictEqual(cx.porForma.pix, venda.total);
    fail(await vend.post('/api/vendas', { forma_pgto: 'fiado', itens: [{ produto_id: cap.id, qtd: 1 }] }), 400, 'cliente');
    fail(await vend.post('/api/vendas', { itens: [{ produto_id: cap.id, qtd: 9999 }] }), 400, 'Estoque insuficiente');
    fail(await vend.post('/api/vendas', { itens: [{ produto_id: gas.id, qtd: 3, cilindro_id: cil.id }] }), 400, 'só tem');
    assert.strictEqual((await prod('Capacitor 35+5')).estoque, 52, 'venda recusada não altera estoque (rollback)');
  });

  await test('venda a prazo (fiado) vira conta a receber e pode ser baixada', async () => {
    const v = ok(await vend.post('/api/vendas', { cliente_id: cliente.id, forma_pgto: 'fiado', itens: [{ produto_id: cap.id, qtd: 1 }] }));
    const l = ok(await sup.get('/api/lancamentos?tipo=receber&situacao=abertos')).find(x => x.descricao === `Venda nº ${v.numero}`);
    assert.ok(l && l.pago === 0 && l.valor === 48);
    ok(await sup.post(`/api/lancamentos/${l.id}/baixar`, { forma: 'dinheiro' }));
    fail(await sup.post(`/api/lancamentos/${l.id}/baixar`, { forma: 'dinheiro' }), 400, 'Já está pago');
  });

  await test('cancelamento e devolução: só supervisor/master; estoque e caixa voltam', async () => {
    fail(await vend.post(`/api/vendas/${venda.id}/cancelar`, { motivo: 'teste' }), 403);
    const dev = ok(await sup.post(`/api/vendas/${venda.id}/devolver`, { motivo: 'Cliente trocou', itens: [{ item_id: ok(await sup.get(`/api/vendas/${venda.id}`)).itens[0].id, qtd: 1 }] }));
    assert.ok(dev.valor > 0);
    const estAntes = (await prod('Capacitor 35+5')).estoque;
    ok(await sup.post(`/api/vendas/${venda.id}/cancelar`, { motivo: 'Desistência do cliente' }));
    assert.strictEqual((await prod('Capacitor 35+5')).estoque, estAntes + 1);
    assert.strictEqual(ok(await sup.get('/api/cilindros')).find(c => c.numero === 'C-0007').saldo_kg, 4.3);
    fail(await sup.post(`/api/vendas/${venda.id}/cancelar`, { motivo: 'de novo' }), 400, 'já está cancelada');
    const cx = ok(await sup.get('/api/caixa'));
    assert.ok(cx.saidas > 0, 'estorno aparece como saída no caixa');
  });

  let orc;
  await test('orçamento: itens, margem só para a loja, aprovação e conversão em venda', async () => {
    const srvIns = await prod('Instalação split até 24.000');
    const split = await prod('Split Inverter 24.000');
    orc = ok(await vend.post('/api/orcamentos', { cliente_id: cliente.id, obs: 'Instalar no salão', itens: [
      { produto_id: split.id, qtd: 2 }, { produto_id: srvIns.id, qtd: 2 }, { tipo: 'desloc', descricao: 'Deslocamento - Centro', unidade: 'un', qtd: 1, unitario: 50 }] }));
    const v = ok(await vend.get(`/api/orcamentos/${orc.id}`));
    assert.strictEqual(v.total, 2 * 2290 + 2 * 550 + 50); assert.ok(!('lucro' in v), 'vendedor não vê lucro');
    const s = ok(await sup.get(`/api/orcamentos/${orc.id}`));
    assert.strictEqual(s.custo_total, 3400); assert.strictEqual(s.lucro, s.total - 3400);
    ok(await vend.put(`/api/orcamentos/${orc.id}`, { cliente_id: cliente.id, desconto_valor: 100, itens: v.itens.map(i => ({ produto_id: i.produto_id, tipo: i.tipo, descricao: i.descricao, unidade: i.unidade, qtd: i.qtd, unitario: i.unitario })) }));
    assert.strictEqual(ok(await vend.get(`/api/orcamentos/${orc.id}`)).total, 5730 - 100);
    ok(await vend.post(`/api/orcamentos/${orc.id}/status`, { status: 'enviado' }));
    const conv = ok(await vend.post(`/api/orcamentos/${orc.id}/converter`, { para: 'venda', forma_pgto: 'credito' }));
    assert.strictEqual(conv.total, 5630);
    assert.strictEqual((await prod('Split Inverter 24.000')).estoque, 1);
    assert.strictEqual(ok(await vend.get(`/api/orcamentos/${orc.id}`)).status, 'convertido');
    fail(await vend.post(`/api/orcamentos/${orc.id}/converter`, { para: 'venda' }), 400, 'já foi convertido');
    fail(await vend.put(`/api/orcamentos/${orc.id}`, { itens: [{ produto_id: split.id, qtd: 1 }] }), 400, 'não pode mais ser editado');
  });

  await test('orçamento vencido aparece como expirado', async () => {
    const o = ok(await vend.post('/api/orcamentos', { cliente_id: cliente.id, validade: '2020-01-01', itens: [{ produto_id: cap.id, qtd: 1 }] }));
    assert.strictEqual(ok(await vend.get(`/api/orcamentos/${o.id}`)).status, 'expirado');
  });

  let osId; let equip;
  await test('ordem de serviço: técnico, checklist, fotos, baixa de peças/gás na conclusão e faturamento', async () => {
    equip = ok(await sup.get(`/api/clientes/${cliente.id}`)).equipamentos[0];
    const tecnico = ok(await sup.get('/api/equipe')).find(u => u.role === 'tecnico');
    const gas32 = await prod('Gás refrigerante R-32'); const capp = await prod('Capacitor 25+2,5'); const mo = await prod('Manutenção corretiva');
    const o = ok(await sup.post('/api/os', { cliente_id: cliente.id, equipamento_id: equip.id, tecnico_id: tecnico.id, tipo: 'corretiva', agendada_para: '2030-01-10', descricao: 'Não gela',
      itens: [{ produto_id: gas32.id, qtd: 1.2 }, { produto_id: capp.id, qtd: 1 }, { produto_id: mo.id, qtd: 1 }] }));
    osId = o.id;
    const d = ok(await tec.get(`/api/os/${osId}`));
    assert.strictEqual(d.status, 'agendada'); assert.ok(d.checklist.length >= 5); assert.ok(d.editavel);
    // o técnico vê o que fazer, mas não os preços; o supervisor vê tudo
    assert.strictEqual(d.total, undefined); assert.ok(d.sem_valores && d.itens.length === 3 && d.itens.every(i => i.unitario === undefined && i.total === undefined));
    assert.strictEqual(ok(await sup.get(`/api/os/${osId}`)).total, 132 + 42 + 180);
    assert.strictEqual(ok(await vend.get('/api/os')).length >= 1, true);
    fail(await sup.post(`/api/os/${osId}/faturar`, { forma_pgto: 'pix' }), 400, 'concluída');
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    ok(await tec.post(`/api/os/${osId}/fotos`, { data: jpeg, legenda: 'Antes' }));
    assert.strictEqual(ok(await tec.get(`/api/os/${osId}`)).fotos.length, 1);
    const img = await tec.call('GET', `/api/os/${osId}/fotos/${d.fotos?.[0]?.id || 1}`, undefined, { raw: true }); assert.strictEqual(img.headers.get('content-type'), 'image/jpeg');
    const chk = d.checklist.map(c => ({ ...c, ok: true }));
    const antes = (await prod('Gás refrigerante R-32')).estoque;
    ok(await tec.post(`/api/os/${osId}/concluir`, { laudo: 'Trocado o capacitor e feita carga de gás', checklist: chk, assinatura_nome: 'Dra. Ana', assinatura: 'data:image/png;base64,iVBORw0KGgo=' }));
    assert.ok(Math.abs((await prod('Gás refrigerante R-32')).estoque - (antes - 1.2)) < 0.01);
    assert.strictEqual((await prod('Capacitor 25+2,5')).estoque, 7);
    fail(await tec.post(`/api/os/${osId}/concluir`, {}), 400, 'encerrada');
    fail(await tec.post(`/api/os/${osId}/faturar`, { forma_pgto: 'pix' }), 403);
    ok(await sup.post(`/api/os/${osId}/faturar`, { forma_pgto: 'pix' }));
    assert.strictEqual(ok(await sup.get(`/api/os/${osId}`)).status, 'faturada');
  });

  await test('técnico só enxerga as próprias OS', async () => {
    const outra = ok(await sup.post('/api/os', { cliente_id: cliente.id, tipo: 'visita' }));
    fail(await tec.get(`/api/os/${outra.id}`), 403);
    const meId = ok(await tec.get('/api/me')).user.id;
    assert.ok(ok(await tec.get('/api/os')).every(o => o.tecnico_id === meId));
  });

  await test('alerta de possível vazamento após 3 cargas de gás no mesmo equipamento', async () => {
    const tecnico = ok(await sup.get('/api/equipe')).find(u => u.role === 'tecnico');
    const gas32 = await prod('Gás refrigerante R-32');
    for (let i = 0; i < 2; i++) {
      const o = ok(await sup.post('/api/os', { cliente_id: cliente.id, equipamento_id: equip.id, tecnico_id: tecnico.id, tipo: 'corretiva', itens: [{ produto_id: gas32.id, qtd: 0.5 }] }));
      ok(await sup.post(`/api/os/${o.id}/concluir`, {}));
    }
    const al = ok(await sup.get('/api/gas/alertas'));
    assert.strictEqual(al.length, 1); assert.strictEqual(al[0].cargas, 3);
  });

  await test('financeiro: lançamento manual, baixa e exclusão', async () => {
    const l = ok(await sup.post('/api/lancamentos', { tipo: 'pagar', descricao: 'Conta de luz', valor: 380.5, vencimento: '2026-12-10' }));
    fail(await sup.post('/api/lancamentos', { tipo: 'pagar', descricao: 'x', valor: -5 }), 400);
    ok(await sup.post(`/api/lancamentos/${l.id}/baixar`, { forma: 'pix' }));
    fail(await sup.call('DELETE', `/api/lancamentos/${l.id}`), 400, 'já pago');
    const l2 = ok(await sup.post('/api/lancamentos', { tipo: 'receber', descricao: 'Aluguel de ferramenta', valor: 100 }));
    ok(await sup.call('DELETE', `/api/lancamentos/${l2.id}`));
  });

  await test('painel e relatórios', async () => {
    const p = ok(await sup.get('/api/painel'));
    assert.ok(p.vendas_hoje > 0 && p.semana.length === 7 && p.estoque_baixo && p.contas);
    const pv = ok(await vend.get('/api/painel')); assert.ok(!pv.contas && pv.orcamentos);
    const pt = ok(await tec.get('/api/painel')); assert.ok(pt.os && !pt.orcamentos);
    const rel = ok(await sup.get('/api/relatorios/vendedores'));
    const joao = rel.find(x => x.nome.startsWith('João')); assert.ok(joao && joao.comissao > 0);
    const lucro = ok(await sup.get('/api/relatorios/lucro')); assert.ok(lucro.length && lucro.every(x => x.lucro === r2(x.receita - x.custo)));
    const est = ok(await sup.get('/api/relatorios/estoque')); assert.ok(est.valor_custo > 0);
  });

  await test('impressão: orçamento, recibo, OS e etiqueta', async () => {
    for (const u of [`/print/orcamento/${orc.id}`, `/print/venda/${venda.id}`, `/print/os/${osId}`, `/print/etiqueta/${venda.id}`]) {
      const r = await vend.call('GET', u, undefined, { raw: true });
      const html = await r.text(); assert.strictEqual(r.status, 200); assert.ok(html.includes('Gelo &amp; Cia Refrigeração'), u);
    }
    const h = await (await sup.call('GET', `/print/orcamento/${orc.id}`, undefined, { raw: true })).text();
    assert.ok(h.includes('ORÇAMENTO Nº') && h.includes('R$') && !h.toLowerCase().includes('lucro'));
    const ho = await (await sup.call('GET', `/print/os/${osId}`, undefined, { raw: true })).text(); assert.ok(ho.includes('ORDEM DE SERVIÇO'));
    const outraOS = ok(await sup.post('/api/os', { cliente_id: cliente.id, tipo: 'visita' }));
    assert.strictEqual((await tec.call('GET', `/print/os/${outraOS.id}`, undefined, { raw: true })).status, 403, 'técnico não imprime OS de outro');
    assert.strictEqual((await anon.call('GET', `/print/orcamento/${orc.id}`, undefined, { raw: true })).status, 401);
  });

  await test('backup manual e download; usuário sem permissão não acessa', async () => {
    const b = ok(await sup.post('/api/backups'));
    assert.ok(/^friogest_.*\.db$/.test(b.arquivo));
    const lista = ok(await sup.get('/api/backups')); assert.ok(lista.arquivos.some(a => a.nome === b.arquivo));
    const dl = await sup.call('GET', `/api/backups/${b.arquivo}`, undefined, { raw: true }); assert.strictEqual(dl.status, 200);
    const bytes = Buffer.from(await dl.arrayBuffer()); assert.strictEqual(bytes.slice(0, 15).toString(), 'SQLite format 3');
    fail(await vend.post('/api/backups'), 403);
    fail(await sup.get('/api/backups/..%2f..%2fetc%2fpasswd'), 400);
  });

  await test('auditoria registra as ações e só o master vê', async () => {
    const a = ok(await master.get('/api/auditoria'));
    assert.ok(a.some(x => x.acao === 'venda.criar') && a.some(x => x.acao === 'usuario.criar') && a.some(x => x.acao === 'venda.cancelar'));
    fail(await sup.get('/api/auditoria'), 403);
  });

  await test('auditoria paginada: total, páginas e limites', async () => {
    const p = ok(await master.get('/api/auditoria?pagina=1&por=10'));
    assert.ok(p.total >= p.itens.length && p.itens.length <= 10 && p.paginas >= 1 && p.pagina === 1);
    const u = ok(await master.get('/api/auditoria?pagina=9999&por=10'));
    assert.strictEqual(u.pagina, u.paginas, 'página além do fim vira a última');
    fail(await sup.get('/api/auditoria?pagina=1'), 403);
  });

  await test('usuário desativado perde o acesso na hora; reset de senha exige nova troca', async () => {
    const id = ok(await master.get('/api/usuarios')).find(u => u.username === 'joao').id;
    ok(await master.put(`/api/usuarios/${id}`, { ativo: false }));
    fail(await vend.get('/api/produtos'), 401);
    fail(await new Client().post('/api/login', { username: 'joao', password: 'nova-joao1' }), 401);
    ok(await master.put(`/api/usuarios/${id}`, { ativo: true }));
    ok(await master.post(`/api/usuarios/${id}/senha`, { senha: 'reset1234' }));
    assert.strictEqual(ok(await new Client().post('/api/login', { username: 'joao', password: 'reset1234' })).user.must_change, true);
  });

  await test('manter conectado: volta sem senha, só guarda hash, some ao sair e ao desativar', async () => {
    const raw = (m, u, ck, body) => fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'friogest', Cookie: ck || '' }, body: body && JSON.stringify(body) });
    const ck = r => r.headers.getSetCookie().map(c => c.split(';')[0]);
    // sem marcar: só o cookie de sessão
    assert.strictEqual(ck(await raw('POST', '/api/login', '', { username: 'joao', password: 'reset1234' })).length, 1);
    // marcando: vem também o cookie rm (30 dias, httpOnly)
    const l = await raw('POST', '/api/login', '', { username: 'joao', password: 'reset1234', lembrar: true });
    const cookies = ck(l); assert.strictEqual(cookies.length, 2);
    assert.ok(l.headers.getSetCookie().some(c => /^rm=.*HttpOnly.*Max-Age=2592000/i.test(c)));
    const rm = cookies.find(c => c.startsWith('rm='));
    // o banco guarda só o hash do token, nunca o token nem a senha
    const linhas = srv.db.prepare('SELECT * FROM remember_tokens').all();
    assert.ok(linhas.length >= 1 && linhas.every(x => !rm.includes(x.hash) && x.hash.length === 64));
    // "programa reiniciado": só o cookie rm entra de novo, sem senha
    const me = await raw('GET', '/api/me', rm); assert.strictEqual(me.status, 200);
    assert.ok(ck(me).some(c => c.startsWith('sid=')), 'deveria criar uma sessão nova');
    // sair apaga o token
    await raw('POST', '/api/logout', rm);
    assert.strictEqual((await raw('GET', '/api/me', rm)).status, 401);
    // desativar o usuário derruba os tokens
    const l2 = await raw('POST', '/api/login', '', { username: 'joao', password: 'reset1234', lembrar: true });
    const rm2 = ck(l2).find(c => c.startsWith('rm='));
    const id = ok(await master.get('/api/usuarios')).find(u => u.username === 'joao').id;
    ok(await master.put(`/api/usuarios/${id}`, { ativo: false }));
    assert.strictEqual((await raw('GET', '/api/me', rm2)).status, 401);
    ok(await master.put(`/api/usuarios/${id}`, { ativo: true }));
  });

  await test('XML da NF-e reconhece o gás, cria os cilindros e a venda usa mais de um cilindro quando precisa', async () => {
    const xml = fs.readFileSync(path.join(__dirname, 'sample-nfe.xml'), 'utf8');
    const pv = ok(await master.post('/api/estoque/nfe/preview', { xml }));
    const gas = pv.itens.find(i => /R410A/.test(i.descricao_nf));
    assert.ok(gas && gas.gas && gas.gas.gas_tipo === 'R-410A' && gas.gas.cilindro_kg === 11.34, JSON.stringify(gas && gas.gas));
    assert.ok(!pv.itens.find(i => /CAPACITOR/.test(i.descricao_nf)).gas, 'capacitor não é gás');
    assert.strictEqual(gas.unidade, 'kg'); assert.ok(gas.preco_sugerido > 0);
    // a nota entra: o gás vira cilindros (vincula ao produto de gás que já existe, ou cria um novo com o tipo detectado)
    const antesC = ok(await master.get('/api/cilindros')).filter(c => c.gas_tipo === 'R-410A').length;
    const item = gas.produto ? { produto_id: gas.produto.id, qtd: gas.qtd, custo: gas.custo, preco: gas.preco_sugerido }
      : { novo: { descricao: gas.descricao_nf, cod_fabricante: gas.cod_fabricante, unidade: 'kg', gas_tipo: gas.gas.gas_tipo, cilindro_kg: gas.gas.cilindro_kg }, qtd: gas.qtd, custo: gas.custo, preco: gas.preco_sugerido };
    ok(await master.post('/api/estoque/entrada', { fornecedor: 'Frio Sul', nf_numero: '48213', parcelas: [], itens: [item] }));
    assert.strictEqual(ok(await master.get('/api/cilindros')).filter(c => c.gas_tipo === 'R-410A').length, antesC + 2, 'a nota tem 2 cilindros');
    assert.ok(ok(await master.post('/api/estoque/nfe/preview', { xml })).itens.find(i => /R410A/.test(i.descricao_nf)).produto, 'uma nova leitura vincula ao gás já cadastrado');
    // venda de gás que precisa de mais de um cilindro (um gás à parte: 3 kg + 4 kg)
    ok(await master.post('/api/produtos', { tipo: 'peca', descricao: 'Gás R-600A teste', unidade: 'kg', custo: 10, preco: 30, gas_tipo: 'R-600A', cilindro_kg: 5 }));
    const c1 = ok(await master.post('/api/cilindros', { gas_tipo: 'R-600A', capacidade_kg: 5, saldo_kg: 3, local: 'Loja' })), c2 = ok(await master.post('/api/cilindros', { gas_tipo: 'R-600A', capacidade_kg: 5, saldo_kg: 4, local: 'Depósito' }));
    const p = ok(await master.get('/api/produtos?q=R-600A')).find(x => x.gas_tipo === 'R-600A');
    const v = ok(await master.post('/api/vendas', { forma_pgto: 'pix', itens: [{ produto_id: p.id, qtd: 6 }] }));
    const saldos = async () => ok(await master.get('/api/cilindros')).filter(c => c.gas_tipo === 'R-600A').map(c => c.saldo_kg).sort((x, y) => x - y);
    assert.deepStrictEqual(await saldos(), [1, 0].sort((x, y) => x - y)); // loja (3) esvazia, depósito (4) fica com 1
    fail(await master.post('/api/vendas', { forma_pgto: 'pix', itens: [{ produto_id: p.id, qtd: 5 }] }), 400, 'insuficiente');
    const it = ok(await master.get(`/api/vendas/${v.id}`)).itens[0];
    ok(await master.post(`/api/vendas/${v.id}/devolver`, { itens: [{ item_id: it.id, qtd: 2 }], motivo: 'teste' }));
    assert.strictEqual(r2((await saldos()).reduce((x, y) => x + y, 0)), 3); // 7 - 6 + 2 = 3 kg no total
  });

  await test('relatórios incluem as OS faturadas; recorrentes lançam uma vez por mês; OS fechada não aceita foto; técnico não lista clientes', async () => {
    const vend2 = ok(await master.get('/api/relatorios/vendedores')); assert.ok(vend2.some(x => x.os >= 1 && x.total_os > 0), JSON.stringify(vend2));
    assert.ok(ok(await master.get('/api/relatorios/lucro')).some(x => /Capacitor|Gás|Manuten/i.test(x.descricao)));
    const rec = ok(await master.post('/api/recorrencias', { tipo: 'pagar', descricao: 'Aluguel da loja', valor: 1200, dia: 31, pessoa: 'Imobiliária' }));
    assert.strictEqual(rec.geradas, 1); ok(await master.get('/api/recorrencias'));
    // dia que já passou neste mês: a primeira conta só sai no mês que vem (não nasce vencida)
    const passado = ok(await master.post('/api/recorrencias', { tipo: 'pagar', descricao: 'Internet', valor: 100, dia: 1 }));
    assert.strictEqual(passado.geradas, new Date().getDate() > 1 ? 0 : 1);
    const lan = ok(await master.get('/api/lancamentos?tipo=pagar&situacao=')).filter(l => l.origem === 'recorrente' && l.origem_id === rec.id); assert.strictEqual(lan.length, 1);
    fail(await master.post('/api/recorrencias', { tipo: 'pagar', descricao: 'x', valor: 0, dia: 5 }), 400);
    fail(await tec.post(`/api/os/${osId}/fotos`, { data: 'data:image/png;base64,iVBORw0KGgo=' }), 400, 'concluída');
    fail(await tec.get('/api/clientes'), 403);
    const ficha = await tec.get(`/api/os/${osId}`); assert.strictEqual(ficha.status, 200);
  });

  await test('OS com endereço do atendimento, instruções e prioridade; impressão do técnico sem preços e do cliente com valores', async () => {
    const o = ok(await sup.post('/api/os', { cliente_id: cliente.id, tipo: 'instalacao', descricao: 'Instalar split', atend_endereco: 'Rua das Palmeiras, 55', atend_bairro: 'Centro', atend_referencia: 'Ao lado do mercado', atend_contato: 'Dona Rita', atend_telefone: '(21) 97777-0000', instrucoes: 'Levar escada de 3 m', prioridade: 'urgente',
      itens: [{ descricao: 'Mão de obra de instalação', tipo: 'servico', qtd: 1, unitario: 350 }] }));
    const d = ok(await sup.get(`/api/os/${o.id}`)); assert.strictEqual(d.atend_endereco, 'Rua das Palmeiras, 55'); assert.strictEqual(d.prioridade, 'urgente'); assert.strictEqual(d.itens[0].unitario, 350);
    ok(await sup.put(`/api/os/${o.id}`, { atend_complemento: 'Apto 12', prioridade: 'normal' })); assert.strictEqual(ok(await sup.get(`/api/os/${o.id}`)).atend_complemento, 'Apto 12');
    const html = async (c, q) => (await c.call('GET', `/print/os/${o.id}${q || ''}`, undefined, { raw: true })).text();
    const tecnico = await html(sup, '?via=tecnico'), cliente_ = await html(sup, '');
    assert.ok(tecnico.includes('Rua das Palmeiras, 55') && tecnico.includes('Levar escada de 3 m') && tecnico.includes('Dona Rita') && tecnico.includes('Via do técnico'), 'folha do técnico incompleta');
    assert.ok(!/R\$\s*350/.test(tecnico), 'a folha do técnico não pode ter preços'); assert.ok(/R\$\s*350/.test(cliente_) && cliente_.includes('Via do cliente'), 'a via do cliente tem os valores');
  });

  console.log(`\n${passed} testes passaram.`);
})().catch(e => { console.error('\nFALHOU:', e.message); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100));

function r2(n) { return Math.round(n * 100) / 100; }
