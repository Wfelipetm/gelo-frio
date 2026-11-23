'use strict';
// Testes da integração com a impressora térmica (ESC/POS). Roda com: npm test
// Usa uma "impressora" falsa (servidor TCP) para capturar exatamente os bytes que seriam impressos.
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { createServer } = require('../server');
const { Cupom, encode, decode, interpretar, paraHtml } = require('../server/escpos');

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 5).join('\n    ')); process.exitCode = 1; }
};
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join(' ');

(async () => {
  console.log('ESC/POS (codificação e comandos)');
  await t('acentos viram bytes da página PC850', () => {
    assert.deepStrictEqual([...encode('ação é Ç ã õ Á', 850)], [0x61, 0x87, 0xC6, 0x6F, 0x20, 0x82, 0x20, 0x80, 0x20, 0xC6, 0x20, 0xE4, 0x20, 0xB5]);
  });
  await t('PC860 usa os códigos portugueses de ã/õ', () => { assert.deepStrictEqual([...encode('ãõÃÕ', 860)], [0x84, 0x94, 0x8E, 0x99]); });
  await t('caracteres sem equivalente caem em ASCII ou "?"', () => {
    assert.strictEqual(decode(encode('“oi” — 5…', 850)), '"oi" - 5...');
    assert.strictEqual(decode(encode('日', 850)), '?');
  });
  await t('cupom começa com init + página de código e termina com corte', () => {
    const b = new Cupom({ colunas: 48, codepage: 850 }).line('oi').cut().bytes();
    assert.strictEqual(hex(b.subarray(0, 5)), '1b 40 1b 74 02');
    assert.strictEqual(hex(b.subarray(-4)), '1d 56 42 00');
  });
  await t('lr() alinha o valor à direita na largura exata', () => {
    const b = new Cupom({ colunas: 32 }).lr('TOTAL', 'R$ 90,00').bytes();
    const line = decode(b.subarray(5)).split('\n')[0];
    assert.strictEqual(line.length, 32); assert.ok(line.startsWith('TOTAL') && line.endsWith('R$ 90,00'));
  });
  await t('wrap() nunca passa da largura, mesmo com palavra gigante', () => {
    for (const l of new Cupom({ colunas: 24 }).wrap('Ar-condicionado Split Inverter 12000 BTUs supercalifragilisticoexpialidocious')) assert.ok(l.length <= 24, l);
  });
  await t('QR code gera a sequência GS ( k completa', () => {
    const h = hex(new Cupom().qr('abc').bytes());
    assert.ok(h.includes('1d 28 6b 03 00 31 51 30') && h.includes('31 50 30 61 62 63'));
  });

  await t('interpretar() reproduz alinhamento, negrito, tamanho e corte', () => {
    const b = new Cupom({ colunas: 32 }).align('center').bold(true).size(2, 2).line('GELO').normal().line('texto').lr('TOTAL', '9,00').qr('xyz').cut().bytes();
    const { linhas } = interpretar(b);
    const l0 = linhas[0]; assert.strictEqual(l0.align, 1); assert.strictEqual(l0.w, 2); assert.strictEqual(l0.h, 2); assert.ok(l0.segs[0].bold && l0.segs[0].t === 'GELO');
    const txt = linhas.filter(l => l.tipo === 'texto').map(l => l.segs.map(x => x.t).join(''));
    assert.ok(txt.includes('GELO') && txt.includes('texto'));
    assert.ok(txt.some(x => x.startsWith('TOTAL') && x.endsWith('9,00') && x.length === 32));
    assert.ok(linhas.some(l => l.tipo === 'qr' && l.dados === 'xyz')); assert.strictEqual(linhas.at(-1).tipo, 'corte');
  });
  await t('paraHtml() gera a página de 80 mm com acentos corretos', () => {
    const html = paraHtml(new Cupom().line('Instalação São João').cut().bytes(), { colunas: 48, auto: true });
    assert.ok(html.includes('size:80mm auto') && html.includes('Instalação São João') && html.includes('window.print()'), html.slice(0, 300));
  });

  console.log('\nAPI de impressão');
  const recebidos = []; // impressora falsa na rede
  const fake = net.createServer(s => { const ch = []; s.on('data', d => ch.push(d)); s.on('end', () => recebidos.push(Buffer.concat(ch))); });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const fakePort = fake.address().port;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-print-'));
  const srv = createServer({ dataDir: dir, backupDir: path.join(dir, 'backups'), publicDir: path.join(__dirname, '..', 'public'), readNet: () => ({ lan: false, port: 0 }), writeNet: () => {}, version: 'test' });
  const { port } = await srv.listen(40000 + Math.floor(Math.random() * 20000), '127.0.0.1');
  const B = `http://127.0.0.1:${port}/api`;
  const client = () => {
    let ck = '';
    const fn = async (m, u, b) => {
      const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'friogest', Cookie: ck }, body: b === undefined ? undefined : JSON.stringify(b) });
      const s = r.headers.get('set-cookie'); if (s) ck = s.split(';')[0];
      return { status: r.status, data: await r.json().catch(() => null) };
    };
    fn.cookie = () => ck;
    return fn;
  };
  const rawGet = async (cookieFn, u) => { const r = await fetch(`http://127.0.0.1:${port}${u}`, { headers: { Cookie: cookieFn() } }); return { status: r.status, text: await r.text() }; };
  const adm = client();
  await adm('POST', '/login', { username: 'master', password: 'master123' });
  await adm('POST', '/me/senha', { atual: 'master123', nova: 'Master#1234' });
  const esperar = async () => { for (let i = 0; i < 50 && !recebidos.length; i++) await new Promise(r => setTimeout(r, 40)); return recebidos.shift(); };

  await adm('PUT', '/config', { loja_nome: 'Gelo Frio Refrigeração', loja_doc: '12.345.678/0001-90', impressora_modo: 'rede', impressora_ip: '127.0.0.1', impressora_porta: String(fakePort), impressora_colunas: '48', impressora_codepage: '850' });
  const prod = (await adm('POST', '/produtos', { tipo: 'peca', codigo: 'CAP35', descricao: 'Capacitor 35uF com nome bem comprido para testar quebra de linha no cupom', custo: 20, preco: 50, minimo: 1 })).data;
  await adm('POST', '/estoque/entrada', { fornecedor: 'F', itens: [{ produto_id: prod.id, qtd: 10, custo: 20 }] });
  const venda = (await adm('POST', '/vendas', { itens: [{ produto_id: prod.id, qtd: 2, unitario: 50 }], forma_pgto: 'pix', desconto_pct: 10 })).data;

  await t('imprime o cupom da venda (os bytes certos chegam na impressora)', async () => {
    const r = await adm('POST', `/impressao/venda/${venda.id}`); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const b = await esperar(); assert.ok(b, 'nada chegou na impressora');
    const txt = decode(b, 850);
    assert.strictEqual(hex(b.subarray(0, 5)), '1b 40 1b 74 02'); assert.strictEqual(hex(b.subarray(-4)), '1d 56 42 00');
    for (const s of ['Gelo Frio Refrigera', 'CUPOM DE VENDA N', String(venda.numero), 'Capacitor 35uF', '2 un x R$ 50,00', 'Desconto', '- R$ 10,00', 'TOTAL', 'R$ 90,00', 'Pix', 'sem valor fiscal', 'Obrigado pela prefer']) assert.ok(txt.includes(s), `faltou "${s}" em:\n${txt}`);
  });
  await t('descrição longa é quebrada em várias linhas (nunca corta)', async () => {
    await adm('POST', `/impressao/venda/${venda.id}`);
    const txt = decode(await esperar(), 850);
    assert.ok(txt.includes('quebra de linha') && txt.includes('cupom'), txt);
    for (const l of txt.split('\n')) assert.ok(l.replace(/[\x00-\x1f]/g, '').length <= 60, 'linha larga demais: ' + l);
  });
  await t('imprime orçamento e OS', async () => {
    const cli = (await adm('POST', '/clientes', { nome: 'Maria das Dores', telefone: '(21) 99999-0000' })).data;
    const orc = (await adm('POST', '/orcamentos', { cliente_id: cli.id, itens: [{ produto_id: prod.id, qtd: 1, unitario: 50 }] })).data;
    assert.strictEqual((await adm('POST', `/impressao/orcamento/${orc.id}`)).status, 200);
    const o = decode(await esperar(), 850); assert.ok(o.includes('Maria das Dores') && o.includes('R$ 50,00'), o);
    const os_ = (await adm('POST', '/os', { cliente_id: cli.id, tipo: 'corretiva', descricao: 'Não gela', itens: [{ produto_id: prod.id, qtd: 1, unitario: 50 }] })).data;
    assert.strictEqual((await adm('POST', `/impressao/os/${os_.id}`)).status, 200);
    const s = decode(await esperar(), 850); assert.ok(s.includes('Maria das Dores') && s.includes('gela'), s);
  });
  await t('teste de impressão traz QR code e acentuação', async () => {
    assert.strictEqual((await adm('POST', '/impressao/teste')).status, 200);
    const b = await esperar();
    assert.ok(hex(b).includes('1d 28 6b') && decode(b, 850).includes('TESTE DE IMPRESS'));
  });
  await t('modo "comum": a API não envia ESC/POS e devolve a página do cupom', async () => {
    await adm('PUT', '/config', { impressora_modo: 'comum', impressora_nome: '' });
    const r = await adm('POST', `/impressao/venda/${venda.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert.strictEqual(r.data.abrir, `/print/cupom/venda/${venda.id}`); assert.strictEqual(r.data.nome, '');
    await new Promise(r => setTimeout(r, 150)); assert.strictEqual(recebidos.length, 0, 'nada deve ir para a térmica no modo comum');
    const t2 = await adm('POST', '/impressao/teste'); assert.strictEqual(t2.data.abrir, '/print/cupom/teste/0');
  });
  await t('GET /print/cupom/venda/:id devolve o cupom em HTML (e exige login/permissão)', async () => {
    const ok = await rawGet(adm.cookie, `/print/cupom/venda/${venda.id}?print=1`);
    assert.strictEqual(ok.status, 200); for (const x of ['size:80mm auto', 'CUPOM DE VENDA N', 'Capacitor 35uF', 'R$ 90,00', 'window.print()']) assert.ok(ok.text.includes(x), 'faltou ' + x);
    assert.strictEqual((await rawGet(() => '', `/print/cupom/venda/${venda.id}`)).status, 401);
    assert.strictEqual((await rawGet(adm.cookie, '/print/cupom/venda/99999')).status, 404);
    assert.strictEqual((await rawGet(adm.cookie, '/print/cupom/xyz/1')).status, 400);
  });
  await t('impressora desligada devolve erro claro', async () => {
    await adm('PUT', '/config', { impressora_modo: 'desligada' });
    const r = await adm('POST', `/impressao/venda/${venda.id}`);
    assert.strictEqual(r.status, 400); assert.ok(/configurad/i.test(r.data.erro), JSON.stringify(r.data));
  });
  await t('IP sem resposta devolve 502 (não trava)', async () => {
    await adm('PUT', '/config', { impressora_modo: 'rede', impressora_ip: '127.0.0.1', impressora_porta: '1' });
    const r = await adm('POST', '/impressao/teste'); assert.strictEqual(r.status, 502, JSON.stringify(r.data));
  });
  await t('permissões: técnico não imprime venda; vendedor só a própria', async () => {
    await adm('PUT', '/config', { impressora_modo: 'rede', impressora_ip: '127.0.0.1', impressora_porta: String(fakePort) });
    for (const [u, role] of [['vend1', 'vendedor'], ['tec1', 'tecnico']]) { const cr = await adm('POST', '/usuarios', { username: u, nome: 'Fulano ' + u, role, senha: 'provisoria1' }); assert.strictEqual(cr.status, 200, 'criar ' + u + ': ' + JSON.stringify(cr.data)); }
    const login = async u => { const c = client(); const l = await c('POST', '/login', { username: u, password: 'provisoria1' }); assert.strictEqual(l.status, 200, 'login ' + u + ': ' + JSON.stringify(l.data)); const p = await c('POST', '/me/senha', { atual: 'provisoria1', nova: 'Nova#12345' }); assert.strictEqual(p.status, 200, 'senha ' + u + ': ' + JSON.stringify(p.data)); return c; };
    const tec = await login('tec1'); assert.strictEqual((await tec('POST', `/impressao/venda/${venda.id}`)).status, 403);
    const ven = await login('vend1');
    assert.strictEqual((await ven('POST', `/impressao/venda/${venda.id}`)).status, 403, 'vendedor não pode imprimir venda de outro');
    assert.strictEqual((await ven('POST', '/impressao/teste')).status, 403, 'só quem tem "config" testa a impressora');
  });
  await t('configurações da impressora são salvas e aparecem em /config', async () => {
    await adm('PUT', '/config', { impressora_modo: 'spooler', impressora_nome: 'Bematech MP-4200 TH', impressora_auto: '1', cupom_rodape: 'Volte sempre' });
    const c = (await adm('GET', '/config')).data;
    assert.strictEqual(c.impressora_nome, 'Bematech MP-4200 TH'); assert.strictEqual(c.impressora_auto, '1'); assert.strictEqual(c.cupom_rodape, 'Volte sempre');
  });
  if (process.platform === 'win32') {
    await t('Windows: o script RAW compila e acusa impressora inexistente (502)', async () => {
      await adm('PUT', '/config', { impressora_modo: 'spooler', impressora_nome: 'Impressora-Que-Nao-Existe-XYZ' });
      const r = await adm('POST', '/impressao/teste');
      assert.strictEqual(r.status, 502, JSON.stringify(r.data)); assert.ok(/não encontrada/i.test(r.data.erro), r.data.erro);
    });
    await t('Windows: lista as impressoras instaladas', async () => {
      const r = await adm('GET', '/impressoras'); assert.strictEqual(r.status, 200); assert.ok(Array.isArray(r.data.lista));
      console.log(`      (${r.data.lista.length} impressora(s): ${r.data.lista.map(p => p.nome).join(' | ').slice(0, 160)})`);
    });
  }

  fake.close(); try { srv.close(); } catch { /* ignore */ }
  console.log(`\n${process.exitCode ? '✗ houve falhas' : '✓ ' + passed + ' testes de impressão passaram'}`);
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})().catch(e => { console.error(e); process.exit(1); });
