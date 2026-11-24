import { imprimirCupom, icon, $, $$, esc, api, fdt, fdate, state, table, modal, toast, fail, getForm, fld, inp, ROLES, opts, confirmBox, resizeImage, openExternal } from '../core.js';

const roleDesc = { master: 'Acesso total, inclusive usuários, configurações e auditoria', supervisor: 'Tudo da operação, custos, cancelamentos e financeiro', vendedor: 'PDV, orçamentos, clientes e consulta de estoque (sem custos)', tecnico: 'Apenas as próprias ordens de serviço (sem custos)' };

export async function usuarios(root, ctx) {
  ctx.top('Usuários', '<button class="btn p" id="novo">' + icon('plus') + ' Novo usuário</button>');
  const rows = await api('/usuarios');
  root.innerHTML = `<div class="card">${table([{ h: 'Nome', f: u => `<b>${esc(u.nome)}</b><div class="muted small">${esc(u.username)}</div>` }, { h: 'Perfil', f: u => `<span class="tag t-az">${ROLES[u.role]}</span>` }, { h: 'Comissão', cls: 'r', f: u => u.comissao_pct + '%' },
    { h: 'Situação', f: u => (u.ativo ? '<span class="tag t-vd">Ativo</span>' : '<span class="tag t-cz">Inativo</span>') + (u.must_change ? ' <span class="tag t-lj">senha provisória</span>' : '') }, { h: '', cls: 'r nowrap', f: (u, i) => `<a data-e="${i}">editar</a> · <a data-s="${i}">redefinir senha</a>` }], rows)}</div>
    <div class="card" style="margin-top:16px"><h3>Perfis</h3>${Object.entries(roleDesc).map(([k, v]) => `<div style="margin:6px 0"><b>${ROLES[k]}:</b> <span class="muted">${v}</span></div>`).join('')}</div>`;
  const form = u => modal({ title: u ? `Editar ${u.username}` : 'Novo usuário', html: `<div class="stack">${u ? '' : `<div class="grid2">${fld('Login *', inp('username', '', 'autocomplete="off"'))}${fld('Senha provisória * (mín. 6)', '<input name="senha" type="text" autocomplete="off">')}</div>`}${fld('Nome *', inp('nome', u?.nome))}
    <div class="grid2">${fld('Perfil', `<select name="role">${opts(ROLES, u?.role || 'vendedor')}</select>`)}${fld('Comissão (%)', `<input name="comissao_pct" type="number" step="0.1" value="${u?.comissao_pct ?? 0}">`)}</div>${fld('Telefone', inp('telefone', u?.telefone))}${u ? `<label class="f"><span><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Usuário ativo</span></label>` : '<div class="muted small">No primeiro acesso o usuário será obrigado a trocar a senha.</div>'}</div>`,
    buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'p', onClick: async m => { const f = getForm(m.body); u ? await api('/usuarios/' + u.id, { method: 'PUT', body: f }) : await api('/usuarios', { method: 'POST', body: f }); toast('Salvo', 'ok'); ctx.reload(); } }] });
  $('#novo').onclick = () => form(null);
  $$('[data-e]').forEach(a => a.onclick = () => form(rows[+a.dataset.e]));
  $$('[data-s]').forEach(a => a.onclick = () => { const u = rows[+a.dataset.s];
    modal({ title: `Redefinir senha de ${u.username}`, html: fld('Nova senha provisória (mín. 6)', '<input name="senha" type="text" autocomplete="off">') + '<p class="muted small">O usuário será obrigado a trocar no próximo acesso.</p>',
      buttons: [{ label: 'Cancelar' }, { label: 'Redefinir', cls: 'p', onClick: async m => { await api(`/usuarios/${u.id}/senha`, { method: 'POST', body: getForm(m.body) }); toast('Senha redefinida', 'ok'); ctx.reload(); } }] }); });
}

export async function config(root, ctx) {
  ctx.top('Configurações');
  const [c, rede] = await Promise.all([api('/config'), api('/rede')]);
  let logo = c.loja_logo || '';
  root.innerHTML = `<div class="grid2"><div class="card"><h3>Dados da loja (aparecem nos PDFs)</h3><div class="stack" id="f">${fld('Nome da loja', inp('loja_nome', c.loja_nome))}<div class="grid2">${fld('CNPJ/CPF', inp('loja_doc', c.loja_doc))}${fld('Telefone', inp('loja_telefone', c.loja_telefone))}</div>${fld('Endereço', inp('loja_endereco', c.loja_endereco))}
    <div><div class="muted small b">LOGO</div><div id="lg" style="margin:6px 0"></div><label class="btn sm" style="cursor:pointer">Escolher imagem<input type="file" id="lf" accept="image/*" class="hide"></label> <a id="lr">remover</a></div>
    <div class="grid3">${fld('Margem padrão (%)', `<input name="margem_padrao" type="number" value="${esc(c.margem_padrao)}">`)}${fld('Validade orçamento (dias)', `<input name="validade_dias" type="number" value="${esc(c.validade_dias)}">`)}${fld('Revisão preventiva (meses)', `<input name="manut_meses" type="number" value="${esc(c.manut_meses)}">`)}</div>
    <label class="f"><span><input type="checkbox" name="estoque_negativo" ${c.estoque_negativo === '1' || c.estoque_negativo === 1 ? 'checked' : ''}> Permitir vender com estoque zerado</span></label>
    ${fld('Mensagem do orçamento (WhatsApp) — use {cliente} {numero} {total} {validade} {loja}', `<textarea name="msg_orcamento" rows="4">${esc(c.msg_orcamento)}</textarea>`)}${fld('Mensagem de manutenção — {cliente} {loja} {equipamento}', `<textarea name="msg_manutencao" rows="3">${esc(c.msg_manutencao)}</textarea>`)}
    <button class="btn p" id="save">Salvar configurações</button></div></div>
  <div class="stack"><div class="card"><h3>Acesso pela rede (celular / outro PC)</h3><div class="stack"><label class="f"><span><input type="checkbox" id="lan" ${rede.lan ? 'checked' : ''}> Permitir acesso por outros aparelhos da mesma rede Wi-Fi</span></label>${fld('Porta', `<input id="port" type="number" value="${rede.port}">`)}
    ${rede.ouvindoNaRede ? `<div class="alert ok small">Ativo agora. Endereços: ${rede.urls.map(u => `<b>${esc(u)}</b>`).join(' · ') || '—'}</div>` : '<div class="alert info small">Desativado: só este computador acessa.</div>'}<div class="muted small">Alterar exige reiniciar o programa. Libere o Firewall do Windows quando perguntar.</div><button class="btn" id="net">Salvar e reiniciar</button></div></div>
  <div class="card"><h3>Impressora térmica (cupom não fiscal)</h3><div class="stack" id="pf">
    ${fld('Como a impressora está ligada', `<select name="impressora_modo" id="pm">${[['desligada', 'Desligada'], ['spooler', 'Térmica USB (ESC/POS pelo Windows)'], ['rede', 'Térmica na rede (IP)'], ['comum', 'Impressora comum (laser/jato de tinta)']].map(([k, v]) => `<option value="${k}" ${(c.impressora_modo || 'desligada') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
    <div id="pm-spooler" class="stack"><label class="f"><span id="pn-rot">Impressora do Windows</span><span style="display:flex;gap:8px"><select name="impressora_nome" id="pn" style="flex:1"></select><button type="button" class="btn" id="pr-ref">Atualizar</button></span></label><div class="muted small" id="pn-dica"></div></div>
    <div id="pm-rede" class="grid2">${fld('IP da impressora', inp('impressora_ip', c.impressora_ip, 'placeholder="192.168.0.50"'))}${fld('Porta', inp('impressora_porta', c.impressora_porta || '9100'))}</div>
    <div class="grid2">${fld('Largura do papel', `<select name="impressora_colunas">${[['48', 'Bobina 80 mm (48 colunas)'], ['44', 'Bobina 80 mm (44 colunas)'], ['42', 'Bobina 80 mm (42 colunas · Bematech MP-4200 TH)'], ['40', 'Bobina 80 mm (40 colunas)'], ['32', 'Bobina 58 mm (32 colunas)']].map(([k, v]) => `<option value="${k}" ${String(c.impressora_colunas || '48') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}${fld('Acentuação', `<select name="impressora_codepage">${[['850', 'PC850 (padrão)'], ['860', 'PC860 (português)']].map(([k, v]) => `<option value="${k}" ${String(c.impressora_codepage || '850') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}</div>
    <label class="f"><span><input type="checkbox" name="impressora_corte" ${c.impressora_corte !== '0' ? 'checked' : ''}> Cortar o papel ao final do cupom</span></label>
    <label class="f"><span><input type="checkbox" name="impressora_auto" ${c.impressora_auto === '1' ? 'checked' : ''}> Imprimir o cupom automaticamente ao finalizar a venda</span></label>
    <label class="f"><span><input type="checkbox" name="impressora_gaveta" ${c.impressora_gaveta === '1' ? 'checked' : ''}> Abrir a gaveta de dinheiro ao imprimir</span></label>
    ${fld('Mensagem no rodapé do cupom', `<textarea name="cupom_rodape" rows="2">${esc(c.cupom_rodape || '')}</textarea>`)}
    <div class="bar" style="margin:0"><button class="btn p" id="pr-save">Salvar impressora</button><button class="btn" id="pr-test">${icon('printer', 15)} Imprimir teste</button></div></div></div>
  <div class="card"><h3>Dados de exemplo</h3><p class="muted small">Carrega produtos, clientes e cilindros de demonstração. Só funciona com o cadastro de produtos vazio.</p><button class="btn" id="ex">Carregar exemplo</button></div>
  <div class="card"><h3>Onde ficam os dados</h3><div class="small muted" style="word-break:break-all">Banco: ${esc(rede.dataDir)}<br>Backups: ${esc(rede.backupDir)}</div></div></div></div>`;
  const drawLogo = () => { $('#lg').innerHTML = logo ? `<img src="${logo}" style="max-height:70px;max-width:240px">` : '<span class="muted small">sem logo</span>'; }; drawLogo();
  $('#lf').onchange = async e => { if (e.target.files[0]) { logo = await resizeImage(e.target.files[0], 400, 0.9); drawLogo(); } };
  $('#lr').onclick = () => { logo = ''; drawLogo(); };
  $('#save').onclick = async () => { try { const f = getForm($('#f')); f.estoque_negativo = f.estoque_negativo ? '1' : '0'; f.loja_logo = logo; state.config = await api('/config', { method: 'PUT', body: f }); toast('Configurações salvas', 'ok'); } catch (e) { fail(e); } };
  $('#net').onclick = async () => { try { await api('/rede', { method: 'PUT', body: { lan: $('#lan').checked, port: $('#port').value } });
    if (window.friogest?.restart) { toast('Reiniciando…'); window.friogest.restart(); } else toast('Salvo. Reinicie o programa para aplicar.', 'ok'); } catch (e) { fail(e); } };
  $('#ex').onclick = async () => { if (await confirmBox({ msg: 'Carregar dados de exemplo?', ok: 'Carregar' })) try { await api('/config/exemplo', { method: 'POST' }); toast('Exemplo carregado', 'ok'); } catch (e) { fail(e); } };
  // ---- impressora térmica
  const modoUI = () => {
    const m = $('#pm').value;
    $('#pn-dica').textContent = m === 'comum'
      ? 'Impressora de escritório: o cupom sai em uma tira de 80 mm. Deixe "perguntar" para escolher a impressora na hora (janela de impressão do Windows) ou fixe uma para imprimir direto. Serve para testar o layout sem a térmica.'
      : 'Instale o driver da Bematech/Elgin (ex.: MP-4200 TH) e escolha a impressora aqui. As térmicas aparecem com ★.';
    $('#pn-rot').textContent = m === 'comum' ? 'Impressora' : 'Impressora do Windows';
    $('#pm-spooler').classList.toggle('hide', m !== 'spooler' && m !== 'comum'); $('#pm-rede').classList.toggle('hide', m !== 'rede'); };
  const carregarImpressoras = async () => {
    try {
      const { lista } = await api('/impressoras'); const atual = (state.config.impressora_nome || '');
      $('#pn').innerHTML = '<option value="">' + ($('#pm').value === 'comum' ? '— perguntar a cada impressão —' : '— escolha a impressora —') + '</option>' + lista.map(p => `<option value="${esc(p.nome)}" ${p.nome === atual ? 'selected' : ''}>${esc(p.nome)}${p.termica ? ' ★' : ''}</option>`).join('')
        + (atual && !lista.some(p => p.nome === atual) ? `<option value="${esc(atual)}" selected>${esc(atual)} (não encontrada)</option>` : '');
    } catch (e) { fail(e); }
  };
  const salvarImpressora = async () => {
    const f = getForm($('#pf'));
    for (const k of ['impressora_corte', 'impressora_auto', 'impressora_gaveta']) f[k] = f[k] ? '1' : '0';
    f.impressora_porta = String(f.impressora_porta || '9100'); f.impressora_colunas = String(f.impressora_colunas); f.impressora_codepage = String(f.impressora_codepage);
    state.config = await api('/config', { method: 'PUT', body: f });
  };
  $('#pm').onchange = () => { modoUI(); if (['spooler', 'comum'].includes($('#pm').value)) carregarImpressoras(); };
  modoUI(); if (['spooler', 'comum'].includes(c.impressora_modo || '')) carregarImpressoras();
  $('#pr-ref').onclick = carregarImpressoras;
  $('#pr-save').onclick = async () => { try { await salvarImpressora(); toast('Impressora salva', 'ok'); } catch (e) { fail(e); } };
  $('#pr-test').onclick = async () => { try { await salvarImpressora(); await imprimirCupom('teste'); } catch (e) { fail(e); } };
}

export async function backup(root, ctx) {
  ctx.top('Backup', '<button class="btn p" id="nb">' + icon('save') + ' Fazer backup agora</button>');
  const r = await api('/backups');
  const x = r.externo || { nivel: 'desligado' };
  let st;
  if (x.nivel === 'desligado') st = ['aviso', 'triangle-alert', '<b>Sem cópia externa.</b> Se o computador queimar ou for roubado, os backups somem junto com o banco. Configure abaixo.'];
  else if (x.nivel === 'atrasado') st = ['perigo', 'triangle-alert', `<b>${x.ultimo ? `Última cópia externa há ${x.dias} dia(s).` : 'Nenhuma cópia externa feita ainda.'}</b>${x.erro ? ' ' + esc(x.erro) + '.' : ''}`];
  else if (x.erro) st = ['aviso', 'triangle-alert', `<b>A última tentativa de cópia falhou:</b> ${esc(x.erro)}. A cópia anterior foi em ${esc(fdt(x.ultimo.replace('T', ' ')))}.`];
  else st = ['ok', 'check', `<b>Cópia externa em dia.</b> Última: ${esc(fdt(x.ultimo.replace('T', ' ')))}.`];
  root.innerHTML = `<div class="card"><h3>Cópia externa (protege se o computador queimar)</h3>
    <div class="bk-st ${st[0]}">${icon(st[1], 17)}<div>${st[2]}</div></div>
    <div class="small muted" style="margin-bottom:10px">A cada backup, o sistema copia o arquivo também para esta pasta (guarda os últimos 30). Use a pasta do <b>Google Drive</b> (instale o Google Drive para computador e crie uma pasta em <i>Meu Drive</i>, por exemplo <b>G:\\Meu Drive\\FrioGest-Backup</b>), um <b>pendrive</b> ou um <b>HD externo</b>. Se a unidade estiver desligada, o sistema tenta de novo sozinho.</div>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><input id="bx-pasta" style="flex:1;min-width:240px" placeholder="Caminho completo da pasta" value="${esc(x.pasta || '')}">
      ${window.friogest?.escolherPasta ? '<button class="btn" id="bx-esc" type="button">Escolher pasta…</button>' : ''}
      <button class="btn p" id="bx-save" type="button">Salvar e copiar agora</button>
      ${x.pasta ? '<button class="btn" id="bx-off" type="button">Desligar</button>' : ''}</div></div>
  <div class="alert info" style="margin-top:14px">Backups automáticos 1x por dia (mantém os últimos 30). Pasta no computador: <b>${esc(r.pasta)}</b></div>
  <div class="card" style="margin-top:14px">${table([{ h: 'Arquivo', f: b => esc(b.nome) }, { h: 'Data', f: b => fdt(b.data.replace('T', ' ')) }, { h: 'Tamanho', cls: 'r', f: b => (b.tamanho / 1048576).toFixed(2) + ' MB' }, { h: '', cls: 'r', f: b => `<a href="/api/backups/${encodeURIComponent(b.nome)}" download>baixar</a>` }], r.arquivos, { empty: 'Nenhum backup ainda.' })}</div>
  <div class="card" style="margin-top:14px"><h3>Como restaurar</h3><ol class="small" style="line-height:1.8"><li>Feche o FrioGest.</li><li>Copie o arquivo de backup desejado para a pasta do banco (veja em Configurações).</li><li>Renomeie-o para <b>friogest.db</b>, substituindo o atual (apague os arquivos friogest.db-wal e -shm, se houver).</li><li>Abra o FrioGest.</li></ol></div>`;
  const avisar = () => window.dispatchEvent(new Event('friogest:backup'));
  $('#nb').onclick = async () => {
    try {
      const o = await api('/backups', { method: 'POST' });
      if (o.status?.nivel === 'desligado' || o.externo?.ok) toast(o.externo?.ok ? 'Backup criado e copiado para a pasta externa' : 'Backup criado', 'ok');
      else toast('Backup criado, mas a cópia externa falhou: ' + (o.externo?.erro || 'erro desconhecido'), 'err');
      avisar(); ctx.reload();
    } catch (e) { fail(e); }
  };
  if ($('#bx-esc')) $('#bx-esc').onclick = async () => { const p = await window.friogest.escolherPasta({ inicio: $('#bx-pasta').value }); if (p) $('#bx-pasta').value = p; };
  $('#bx-save').onclick = async () => {
    const pasta = $('#bx-pasta').value.trim();
    if (!pasta) return fail(new Error('Informe a pasta da cópia externa'));
    try {
      const o = await api('/backups/externo', { method: 'PUT', body: { pasta } });
      if (o.copia?.externo?.ok) toast('Pasta salva e primeira cópia feita', 'ok'); else toast('Pasta salva, mas a cópia falhou: ' + (o.copia?.externo?.erro || 'erro'), 'err');
      avisar(); ctx.reload();
    } catch (e) { fail(e); }
  };
  if ($('#bx-off')) $('#bx-off').onclick = async () => {
    if (!(await confirmBox({ title: 'Desligar a cópia externa', msg: 'Os backups continuam só neste computador.', ok: 'Desligar', danger: true }))) return;
    try { await api('/backups/externo', { method: 'PUT', body: { pasta: '' } }); toast('Cópia externa desligada', 'ok'); avisar(); ctx.reload(); } catch (e) { fail(e); }
  };
}

export async function auditoria(root, ctx) {
  ctx.top('Auditoria');
  const cols = [{ h: 'Quando', f: a => fdt(a.created_at) }, { h: 'Usuário', f: a => esc(a.username || '') }, { h: 'Ação', f: a => `<span class="tag t-cz">${esc(a.acao)}</span>` }, { h: 'Detalhe', f: a => esc(a.detalhe || '') }];
  let pagina = 1;
  const carregar = async () => {
    const r = await api(`/auditoria?pagina=${pagina}&por=50`);
    pagina = r.pagina;
    const de = r.total ? (r.pagina - 1) * r.por + 1 : 0, ate = Math.min(r.pagina * r.por, r.total);
    const nav = r.paginas > 1 ? `<div class="pager"><span class="muted">${de}–${ate} de ${r.total} registros · página ${r.pagina} de ${r.paginas}</span><span class="sp"></span>
      <button class="btn" id="pg-ini" ${r.pagina <= 1 ? 'disabled' : ''}>Primeira</button>
      <button class="btn" id="pg-ant" ${r.pagina <= 1 ? 'disabled' : ''}>${icon('chevron-left', 16)} Anterior</button>
      <button class="btn" id="pg-prox" ${r.pagina >= r.paginas ? 'disabled' : ''}>Próxima ${icon('chevron-right', 16)}</button>
      <button class="btn" id="pg-fim" ${r.pagina >= r.paginas ? 'disabled' : ''}>Última</button></div>` : `<div class="pager"><span class="muted">${r.total} registro(s)</span></div>`;
    root.innerHTML = `<div class="card">${table(cols, r.itens, { empty: 'Sem registros.' })}${nav}</div>`;
    const ir = n => () => { pagina = n; carregar().catch(fail); };
    const b = id => $(id, root);
    if (b('#pg-ini')) { b('#pg-ini').onclick = ir(1); b('#pg-ant').onclick = ir(pagina - 1); b('#pg-prox').onclick = ir(pagina + 1); b('#pg-fim').onclick = ir(r.paginas); }
    root.closest('.main')?.scrollTo?.(0, 0); window.scrollTo(0, 0);
  };
  await carregar();
}
