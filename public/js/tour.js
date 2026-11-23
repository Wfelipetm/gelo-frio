// Tour guiado de primeiro acesso: percorre o sistema de ponta a ponta, tela por tela.
// Só navega e explica — nunca grava nada. Passos dependem das permissões do usuário.
import { $, $$, esc, state, icon } from './core.js';

const KEY = () => `friogest:tour:${state.user?.id ?? 'x'}`;
export const tourVisto = () => { try { return !!localStorage.getItem(KEY()); } catch { return false; } };
const marcarVisto = () => { try { localStorage.setItem(KEY(), new Date().toISOString()); } catch { /* sem storage: roda de novo no próximo login */ } };

const ROLES = { master: 'Master', supervisor: 'Supervisor', vendedor: 'Vendedor', tecnico: 'Técnico' };

// Cada passo: hash (rota), sel (elemento a destacar; sem sel = cartão centralizado),
// perm (permissões aceitas, "a|b"), optional (pula se o elemento não existir), side (abre o menu no celular)
function passos() {
  const S = [];
  const add = (p) => { if (!p.perm || p.perm.split('|').some(x => state.can(x))) S.push(p); };
  const nome = (state.user?.nome || '').split(' ')[0];

  add({ title: `Bem-vindo ao FrioGest${nome ? ', ' + esc(nome) : ''}!`, hash: '#/painel',
    text: `Este tour rápido mostra o sistema de ponta a ponta: <b>vendas, orçamentos, ordens de serviço, estoque, gás, clientes, financeiro, relatórios e administração</b>.<br><br>Ele só mostra as telas — <b>nada é gravado</b>. Use <kbd>←</kbd> <kbd>→</kbd> para navegar e <kbd>Esc</kbd> para sair. Você pode refazê-lo quando quiser em <b>Tour guiado</b>, no rodapé do menu.` });

  add({ title: 'Menu lateral', sel: '#side', side: true, place: 'right',
    text: `Aqui ficam todos os módulos. Você entrou como <b>${esc(ROLES[state.user?.role] || state.user?.role || '')}</b>, então só vê o que o seu perfil permite. Clique em qualquer item para abrir a tela.` });

  add({ title: 'Painel', hash: '#/painel', sel: '#actions', place: 'bottom',
    text: 'O <b>Painel</b> é a tela inicial. No topo ficam os <b>atalhos</b> mais usados (nova venda, novo orçamento, nova OS).' });
  add({ title: 'Indicadores do dia', hash: '#/painel', sel: '.kpis', optional: true, place: 'bottom',
    text: 'Resumo do negócio: vendas, valores a receber e a pagar, itens com <b>estoque abaixo do mínimo</b>, orçamentos em aberto e ordens de serviço. Os números que aparecem dependem do seu perfil.' });
  add({ title: 'Manutenção preventiva', hash: '#/painel', sel: '#view .card h3', optional: true, place: 'bottom',
    text: 'Abaixo dos indicadores o painel traz listas de apoio, como <b>clientes para oferecer manutenção preventiva</b> — uma boa oportunidade de venda para a loja de ar-condicionado.' });

  // ---------- vendas ----------
  add({ title: 'Nova venda (PDV)', perm: 'venda.criar', hash: '#/pdv', sel: '#busca', place: 'bottom',
    text: 'O <b>balcão</b>. Busque o produto por descrição, código interno, código de fábrica ou <b>leia o código de barras</b>. Atalho: <kbd>F2</kbd> volta o cursor para esta busca.' });
  add({ title: 'Carrinho e cliente', perm: 'venda.criar', hash: '#/pdv', sel: '#cartbox', optional: true, place: 'left',
    text: 'Os itens entram no carrinho. Dá para alterar quantidade, preço e aplicar <b>desconto</b>. Escolha o <b>cliente</b> (obrigatório em fiado) — ou cadastre um novo ali mesmo.' });
  add({ title: 'Pagamento e finalização', perm: 'venda.criar', hash: '#/pdv', sel: '#fin', place: 'top',
    text: 'Escolha a forma de pagamento (Pix, dinheiro, cartão, fiado…) e finalize com <kbd>F10</kbd>. A venda baixa o estoque, gera o financeiro e permite <b>imprimir o recibo</b> em PDF.' });
  add({ title: 'Vendas realizadas', perm: 'venda.criar', hash: '#/vendas', sel: '#list', place: 'top',
    text: 'Histórico de vendas com filtro por período. Abra uma venda para <b>reimprimir recibo</b>, gerar <b>etiqueta de entrega</b> ou fazer <b>devolução de itens</b>.' });

  // ---------- orçamentos ----------
  add({ title: 'Orçamentos', perm: 'orc.gerir', hash: '#/orcamentos', sel: '#actions', place: 'bottom',
    text: 'Crie propostas para os clientes e acompanhe o status: <b>aberto, aprovado ou recusado</b>. Use <b>Novo orçamento</b> para começar.' });
  add({ title: 'Montando um orçamento', perm: 'orc.gerir', hash: '#/orcamentos/novo', sel: '#busca', place: 'bottom',
    text: 'Adicione peças e serviços pela busca. Também dá para incluir <b>item livre / deslocamento</b> e usar a <b>calculadora de BTUs</b> para dimensionar o aparelho certo.' });
  add({ title: 'Gerar PDF e enviar', perm: 'orc.gerir', hash: '#/orcamentos/novo', sel: '#acoes', optional: true, place: 'left',
    text: 'Salve, <b>gere o PDF</b> e abra o <b>WhatsApp</b> com a mensagem pronta (arraste o PDF para a conversa). Quando o cliente aceitar, marque <b>aprovado</b> e <b>converta em venda ou OS</b>. A aprovação é manual.' });

  // ---------- ordens de serviço ----------
  add({ title: 'Ordens de serviço', perm: 'os.ver', hash: '#/os', sel: '#list', place: 'top',
    text: 'Instalações, manutenções e reparos. Aqui você acompanha a <b>agenda e o status</b> de cada OS (aberta, agendada, em atendimento, concluída, faturada). Técnicos veem as suas OS.' });
  add({ title: 'Abrindo uma OS', perm: 'os.gerir', hash: '#/os/nova', sel: '#tipo', optional: true, place: 'bottom',
    text: 'Escolha o <b>tipo de serviço</b>, o cliente, o equipamento e o técnico responsável, e agende a visita.' });
  add({ title: 'Peças, gás e serviços', perm: 'os.gerir', hash: '#/os/nova', sel: '#busca', optional: true, place: 'bottom',
    text: 'Lance peças, <b>gás refrigerante</b> e mão de obra. O cilindro de gás é escolhido automaticamente. <b>Estoque e gás só baixam ao concluir a OS.</b>' });
  add({ title: 'Laudo, fotos e assinatura', perm: 'os.gerir', hash: '#/os/nova', sel: '#laudo', optional: true, place: 'top',
    text: 'O técnico registra o <b>laudo</b>, anexa <b>fotos</b> e colhe a <b>assinatura do cliente</b> na própria tela. Depois de concluir, use <b>Faturar</b> para gerar o lançamento financeiro e <b>PDF</b> para imprimir a OS.' });

  // ---------- estoque ----------
  add({ title: 'Estoque', perm: 'estoque.ver', hash: '#/estoque', sel: '#tabs', place: 'bottom',
    text: 'Três abas: <b>Produtos e serviços</b> (cadastro, preços e estoque mínimo), <b>Entrada de mercadoria</b> e <b>Movimentações</b> (todo o histórico de entradas e saídas).' });
  add({ title: 'Entrada por XML da NF-e', perm: 'estoque.gerir', hash: '#/estoque?tab=entrada', sel: '#tabs .tab[data-t="entrada"]', place: 'bottom',
    text: 'Receba mercadoria <b>importando o XML da NF-e de compra</b> (fornecedor, itens, custos e parcelas a pagar entram automaticamente) ou faça a <b>entrada manual</b>.' });

  // ---------- gás ----------
  add({ title: 'Gás refrigerante', perm: 'gas.ver', hash: '#/gas', sel: '#view > *:first-child', place: 'bottom',
    text: 'O gás é controlado <b>por cilindro, em kg</b>. Cada venda ou OS desconta do cilindro certo, e o sistema <b>alerta possível vazamento</b> quando um mesmo equipamento recebe 3 ou mais cargas em 12 meses.' });

  // ---------- clientes ----------
  add({ title: 'Clientes', perm: 'cliente.ver', hash: '#/clientes', sel: '#q', place: 'bottom',
    text: 'Busque por nome, CPF/CNPJ ou telefone. Na ficha do cliente você vê <b>equipamentos, orçamentos, OS e histórico de compras</b> e chama direto no WhatsApp.' });

  // ---------- financeiro ----------
  add({ title: 'Financeiro', perm: 'fin.ver', hash: '#/financeiro', sel: '#tabs', place: 'bottom',
    text: '<b>A receber</b> (fiado, boletos, OS faturadas), <b>A pagar</b> (contas e parcelas de NF) e <b>Caixa do dia</b> com a conferência das entradas e saídas.' });

  // ---------- relatórios ----------
  add({ title: 'Relatórios', perm: 'rel.ver', hash: '#/relatorios', sel: '#tabs', place: 'bottom',
    text: 'Comissão por vendedor, <b>lucro por produto</b> e posição de estoque, com filtro de período e <b>exportação para CSV</b>. Os relatórios com custo só aparecem para quem tem essa permissão.' });

  // ---------- administração ----------
  add({ title: 'Usuários e perfis', perm: 'usuarios', hash: '#/usuarios', sel: '#novo', place: 'bottom',
    text: 'Crie os acessos da equipe. Perfis: <b>master, supervisor, vendedor e técnico</b> — cada um enxerga e faz só o que lhe cabe (custos, por exemplo, ficam escondidos de quem não tem permissão).' });
  add({ title: 'Configurações', perm: 'config', hash: '#/config', sel: '#view > *:first-child', place: 'bottom',
    text: 'Dados da loja (que saem nos PDFs), mensagens e o <b>modo rede</b>: libere o acesso de outros computadores da loja ao mesmo sistema (exige reiniciar).' });
  add({ title: 'Backup', perm: 'backup', hash: '#/backup', sel: '#nb', place: 'bottom',
    text: 'O sistema faz <b>backup diário automático</b> (guarda os últimos 30) em Documentos/FrioGest/Backups. Aqui você também faz um backup na hora e baixa o arquivo.' });
  add({ title: 'Auditoria', perm: 'auditoria', hash: '#/auditoria', sel: '#view > *:first-child', place: 'bottom',
    text: 'Tudo o que é feito no sistema fica registrado: <b>quem, quando e o quê</b> (preços alterados, descontos, cancelamentos…).' });

  add({ title: 'Sua conta', sel: '.side .user', side: true, place: 'right', hash: '#/painel',
    text: 'Aqui você <b>troca a senha</b>, <b>sai</b> do sistema e reabre este <b>Tour guiado</b> sempre que precisar.' });
  add({ title: 'Tudo pronto!', hash: '#/painel',
    text: `Você já conhece o FrioGest. Para começar, que tal registrar uma <b>venda</b> ou criar um <b>orçamento</b>?<br><br><b>Atalhos úteis:</b> <kbd>F2</kbd> busca no PDV · <kbd>F10</kbd> finalizar venda.<br>Dúvidas? Refaça o tour em <b>Tour guiado</b>.` });
  return S;
}

// ---------- motor ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ativo = null;

async function esperarTela() {
  await sleep(80);
  for (let i = 0; i < 60; i++) { // até ~5 s
    const v = $('#view');
    if (v && v.firstElementChild && !/^Carregando/.test(v.textContent.trim().slice(0, 12))) return;
    await sleep(80);
  }
}
async function esperarEl(sel) {
  for (let i = 0; i < 25; i++) { const el = $(sel); if (el && el.getClientRects().length) return el; await sleep(80); }
  return null;
}

export async function iniciarTour({ marcar = true } = {}) {
  if (ativo) return;
  const steps = passos();
  if (!steps.length) return;
  let i = 0, token = 0;

  const shade = document.createElement('div'); shade.className = 'tour-shade';
  const spot = document.createElement('div'); spot.className = 'tour-spot hide';
  const card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
  document.body.append(shade, spot, card);
  let alvo = null;

  const fechar = (concluido = true) => {
    token++; ativo = null;
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', posicionar, true);
    shade.remove(); spot.remove(); card.remove();
    $('#side')?.classList.remove('open');
    if (marcar && concluido) marcarVisto();
  };

  function posicionar() {
    if (!alvo || !document.body.contains(alvo)) { spot.classList.add('hide'); shade.classList.add('dark'); card.style.left = '50%'; card.style.top = '50%'; card.style.transform = 'translate(-50%,-50%)'; return; }
    const pad = 6, r = alvo.getBoundingClientRect();
    shade.classList.remove('dark'); spot.classList.remove('hide');
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    card.style.transform = 'none';
    const cw = card.offsetWidth, ch = card.offsetHeight, W = innerWidth, H = innerHeight, g = 14;
    const pref = steps[i].place || 'bottom';
    const cx = x => Math.min(Math.max(8, x), W - cw - 8), cy = y => Math.min(Math.max(8, y), H - ch - 8);
    // cada lado só precisa caber no seu eixo principal; o outro eixo é ajustado para dentro da tela
    const tent = {
      bottom: [cx(r.left + r.width / 2 - cw / 2), r.bottom + pad + g], top: [cx(r.left + r.width / 2 - cw / 2), r.top - pad - g - ch],
      right: [r.right + pad + g, cy(r.top + r.height / 2 - ch / 2)], left: [r.left - pad - g - cw, cy(r.top + r.height / 2 - ch / 2)],
    };
    const cabe = ([x, y]) => x >= 8 && y >= 8 && x + cw <= W - 8 && y + ch <= H - 8;
    let pos = [pref, 'bottom', 'top', 'right', 'left'].map(k => tent[k]).find(cabe);
    if (!pos) { // alvo grande: cartão sobreposto no canto inferior
      pos = [Math.min(Math.max(8, r.left + 16), W - cw - 8), Math.max(8, Math.min(H - ch - 16, r.bottom - ch - 16))];
    }
    card.style.left = Math.min(Math.max(8, pos[0]), W - cw - 8) + 'px';
    card.style.top = Math.min(Math.max(8, pos[1]), H - ch - 8) + 'px';
  }

  async function mostrar(dir = 1) {
    const my = ++token;
    let p = steps[i];
    card.classList.add('busy');
    // navega
    if (p.hash && location.hash !== p.hash) { location.hash = p.hash; await esperarTela(); }
    else if (p.hash) await sleep(30);
    if (my !== token) return;
    // menu no celular
    const burger = $('.burger'); const mobile = !!burger && getComputedStyle(burger).display !== 'none';
    const abrir = !!(p.side && mobile), estava = $('#side')?.classList.contains('open');
    $('#side')?.classList.toggle('open', abrir);
    if (abrir !== !!estava) await sleep(280); // espera a animação do menu antes de medir
    if (my !== token) return;
    // alvo
    alvo = null;
    if (p.sel) {
      alvo = await esperarEl(p.sel);
      if (my !== token) return;
      if (!alvo && p.optional) { // pula passos cujo elemento não existe nesta conta/tela
        const nx = i + dir; if (nx >= 0 && nx < steps.length) { i = nx; return mostrar(dir); }
      }
      if (alvo) { alvo.scrollIntoView({ block: 'center', behavior: 'instant' }); await sleep(60); }
    }
    if (my !== token) return;
    desenhar();
    card.classList.remove('busy');
    posicionar();
    setTimeout(() => { if (my === token) posicionar(); }, 150); // reposiciona quando o layout assentar
    setTimeout(() => { if (my === token) posicionar(); }, 450);
    $('.tour-next', card)?.focus({ preventScroll: true });
  }

  function desenhar() {
    const p = steps[i], ultimo = i === steps.length - 1, primeiro = i === 0;
    card.innerHTML = `<div class="tour-top"><span class="tour-count">${primeiro ? 'Tour guiado' : `Passo ${i + 1} de ${steps.length}`}</span><button type="button" class="tour-x" data-a="skip" aria-label="Fechar tour">${icon('x', 18)}</button></div>
      <h3>${p.title}</h3><div class="tour-text">${p.text}</div>
      <div class="tour-bar"><i style="width:${Math.round(((i + 1) / steps.length) * 100)}%"></i></div>
      <div class="tour-btns">${ultimo ? '<span></span>' : `<button type="button" class="btn sm" data-a="skip">${primeiro ? 'Agora não' : 'Pular tour'}</button>`}
        <span class="grow"></span>${primeiro ? '' : `<button type="button" class="btn sm" data-a="prev">${icon('arrow-left', 14)} Voltar</button>`}
        <button type="button" class="btn p sm tour-next" data-a="next">${primeiro ? 'Começar' : ultimo ? 'Concluir' : 'Próximo'} ${ultimo ? icon('check', 14) : icon('arrow-right', 14)}</button></div>`;
  }

  const proximo = () => { if (i >= steps.length - 1) { fechar(true); if (location.hash !== '#/painel') location.hash = '#/painel'; return; } i++; mostrar(1); };
  const anterior = () => { if (i > 0) { i--; mostrar(-1); } };
  card.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'next') proximo(); else if (a === 'prev') anterior(); else fechar(true);
  });
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(true); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); proximo(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); anterior(); }
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', posicionar);
  window.addEventListener('scroll', posicionar, true);
  ativo = { fechar };
  mostrar(1);
}
