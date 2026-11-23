'use strict';
// Monta o MANUAL DO USUÁRIO (HTML único, com as imagens embutidas) a partir de manual/img (scripts/manual-prints.js).
//   node scripts/manual-prints.js && node scripts/manual-build.js
// Saída: manual/Manual-FrioGest.html (abre no navegador; Ctrl+P → "Salvar como PDF") e manual/Manual-FrioGest.fragmento.html (para publicar na web).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'manual');
const prints = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(DIR, 'prints.json'), 'utf8')).map(p => [p.arquivo, p]));
const b64 = a => fs.readFileSync(path.join(DIR, 'img', a + '.jpg')).toString('base64');

// ---------------------------------------------------------------- conteúdo
const C = [];
const cap = (id, titulo, intro, blocos) => C.push({ id, titulo, intro, blocos });
const P = t => ({ t: 'p', x: t });
const PASSOS = (titulo, itens) => ({ t: 'passos', titulo, itens });
const FIG = (img, legenda) => ({ t: 'fig', img, legenda });
const DICA = x => ({ t: 'dica', x });
const ATENCAO = x => ({ t: 'atencao', x });
const LISTA = itens => ({ t: 'lista', itens });
const TAB = (cab, linhas) => ({ t: 'tab', cab, linhas });

cap('comecar', 'Primeiros passos', 'Como entrar no sistema, criar a sua senha e conhecer a tela inicial.', [
  PASSOS('Entrar no FrioGest', [
    'Dê dois cliques no ícone <b>FrioGest</b> na área de trabalho. O sistema abre numa janela própria. Não precisa de internet.',
    'Digite o seu <b>usuário</b> e a sua <b>senha</b> e clique em <b>Entrar</b>.',
    'No primeiro acesso, o sistema pede para você <b>criar uma senha nova</b> (mínimo de 6 caracteres). Anote em lugar seguro.',
  ]),
  FIG('01-login', { 1: 'Campo do <b>usuário</b>.', 2: 'Campo da <b>senha</b>.', 3: 'Botão <b>Entrar</b>.' }),
  ATENCAO('Depois de <b>5 senhas erradas</b>, o acesso fica bloqueado por 1 minuto. Se esquecer a senha, peça ao responsável (usuário master) para redefinir em <b>Usuários</b>.'),
  PASSOS('Conhecer o painel', [
    'O <b>menu escuro à esquerda</b> leva a todas as telas. Você só vê as telas que o seu perfil permite.',
    'Os <b>cartões</b> mostram o resumo do dia: vendas, orçamentos esperando resposta, ordens de serviço abertas, produtos abaixo do mínimo e valores a receber vencidos.',
    'Os botões do topo (<b>Novo orçamento</b>, <b>Nova venda</b>, <b>Nova OS</b>) são os atalhos mais usados.',
  ]),
  FIG('02-painel', { 1: 'Menu com todas as telas. A tela aberta fica destacada.', 2: 'Cartões de resumo. Valores em vermelho pedem atenção.', 3: 'Atalho para uma <b>nova venda</b>.', 4: 'Seu nome e perfil, com <b>Trocar senha</b>, <b>Tour guiado</b> e <b>Sair</b>.' }),
  P('<b>Tour guiado:</b> na primeira vez que você entra, o sistema mostra um passeio rápido por todas as telas. Use as setas <b>← →</b> para navegar e <b>Esc</b> para sair. Para ver de novo, clique em <b>Tour guiado</b> no rodapé do menu.'),
  FIG('24-tour', {}),
  P('<b>Quem vê o quê:</b> cada pessoa tem um perfil que define o que aparece no menu.'),
  TAB(['Perfil', 'O que pode fazer'], [
    ['Master', 'Tudo: usuários, configurações, backup, auditoria, custos e financeiro.'],
    ['Supervisor', 'Toda a operação, custos, cancelamentos e financeiro.'],
    ['Vendedor', 'Vendas, orçamentos, clientes e consulta de estoque. <b>Não vê custos nem lucro.</b>'],
    ['Técnico', 'Somente as <b>suas</b> ordens de serviço. Não vê custos nem lucro.'],
  ]),
]);

cap('vender', 'Vender no balcão (Nova venda)', 'A tela de venda foi feita para ser rápida: busque o produto, escolha como o cliente vai pagar e finalize.', [
  PASSOS('Fazer uma venda', [
    'Clique em <b>Nova venda</b> no menu.',
    'Se quiser, escolha o <b>cliente</b> (obrigatório só para venda a prazo). Sem cliente, a venda sai como <i>Consumidor</i>.',
    'Na barra de busca, digite parte do <b>nome</b>, o <b>código</b> ou leia o <b>código de barras</b>. Clique no produto para colocar no carrinho. A tecla <b>F2</b> leva o cursor direto para a busca.',
    'Ajuste a <b>quantidade</b> e o <b>preço</b> de cada item, se precisar.',
    'Se for dar desconto, digite o valor e escolha <b>%</b> ou <b>R$</b>.',
    'Escolha a <b>forma de pagamento</b>: Pix, Crédito, Débito, Dinheiro, Fiado ou Boleto.',
    'Clique em <b>Finalizar venda</b> (ou tecle <b>F10</b>). O estoque baixa na hora.',
  ]),
  FIG('03-pdv', { 1: 'Cliente (opcional).', 2: 'Busca de produtos e serviços.', 3: 'Carrinho com os itens da venda.', 4: 'Forma de pagamento.', 5: 'Finalizar a venda.' }),
  FIG('04-pdv-carrinho', { 1: 'Itens no carrinho (um produto e um serviço).', 2: 'Desconto de 5%.', 3: 'Pix escolhido.', 4: 'Total a pagar, já com o desconto.', 5: 'Finalizar venda.' }),
  DICA('<b>Dinheiro:</b> digite o valor recebido e o sistema mostra o <b>troco</b>.'),
  ATENCAO('<b>Venda a prazo (Fiado ou Boleto)</b> exige escolher o cliente e informar o vencimento. O sistema cria sozinho a conta a receber no Financeiro.'),
  ATENCAO('O sistema <b>não deixa vender mais do que existe no estoque</b>. Se o produto não aparece como disponível, lance a entrada de mercadoria antes (veja o capítulo Estoque).'),
  P('<b>Salvar como orçamento:</b> se o cliente ainda não decidiu, use o botão <b>Salvar como orçamento</b> em vez de finalizar. O carrinho vira um orçamento para você enviar depois.'),
  PASSOS('Consultar vendas, imprimir e devolver', [
    'Clique em <b>Vendas</b> no menu. Use a busca e as datas para encontrar uma venda.',
    'Clique na linha da venda para abrir o detalhe.',
    'No detalhe, você pode imprimir o <b>Cupom</b> (impressora térmica), o <b>Recibo</b> ou a <b>Etiqueta de entrega</b>.',
    '<b>Devolver itens</b> traz de volta ao estoque os itens escolhidos. <b>Cancelar venda</b> desfaz a venda inteira (só perfis com permissão).',
  ]),
  FIG('05-vendas', { 1: 'Busca por cliente ou número.', 2: 'Filtro por data.', 3: 'Lista das vendas.', 4: 'Nova venda.' }),
  FIG('06-venda-detalhe', {}),
  P('O <b>Cupom</b> é um comprovante <b>não fiscal</b>: serve de recibo para o cliente, mas não substitui nota fiscal.'),
]);

cap('orcamentos', 'Orçamentos', 'Monte o orçamento com peças, serviços e gás, calcule o aparelho certo e envie para o cliente pelo WhatsApp.', [
  PASSOS('Criar um orçamento', [
    'Clique em <b>Orçamentos</b> e depois em <b>Novo orçamento</b>.',
    'Escolha o <b>cliente</b> (ou cadastre na hora, em <b>+ Novo cliente</b>) e confira a <b>validade</b>.',
    'Busque as peças e serviços e adicione. Use <b>Item livre / deslocamento</b> para cobrar algo que não está cadastrado.',
    'Se precisar, aplique <b>desconto</b>.',
    'Clique em <b>Salvar orçamento</b>.',
  ]),
  FIG('08-orcamento', { 1: 'Cliente e validade.', 2: 'Busca de peças e serviços.', 3: 'Itens do orçamento.', 4: 'Total do orçamento.', 5: 'Ações: salvar, cupom, PDF, WhatsApp, aprovar e converter.', 6: '<b>Calculadora de BTUs</b>: informa a área e as condições do ambiente e recomenda o aparelho.' }),
  P('A caixa <b>Só para a loja</b> (custo, lucro e margem) aparece apenas para quem tem permissão de ver custos. <b>O cliente nunca vê esses valores</b> no PDF.'),
  PASSOS('Enviar e acompanhar', [
    '<b>Gerar PDF</b> abre o orçamento pronto para imprimir ou salvar.',
    '<b>Enviar no WhatsApp</b> abre a conversa com a mensagem pronta. Anexe o PDF antes de enviar.',
    'Quando o cliente responder, clique em <b>Cliente aprovou</b> ou <b>Cliente recusou</b>. A aprovação é feita por você, manualmente.',
    'Orçamento aprovado: use <b>Converter em venda / OS</b> para transformar em venda ou em ordem de serviço, sem digitar de novo.',
  ]),
  FIG('07-orcamentos', { 1: 'Busca.', 2: 'Lista com a situação de cada orçamento (rascunho, aprovado, convertido…).', 3: 'Novo orçamento.' }),
  DICA('Os orçamentos que ainda aguardam resposta aparecem no <b>Painel</b>, para você lembrar de cobrar o cliente.'),
]);

cap('os', 'Ordens de serviço (OS)', 'Do agendamento até o faturamento: instalação, manutenção, limpeza e conserto, com fotos e assinatura do cliente.', [
  PASSOS('Abrir uma OS', [
    'Clique em <b>Ordens de serviço</b> e depois em <b>Nova OS</b> (ou converta um orçamento aprovado).',
    'Escolha o <b>cliente</b> e o <b>equipamento</b> (o aparelho cadastrado na ficha do cliente).',
    'Defina o <b>tipo</b> (Instalação, Manutenção corretiva, Manutenção preventiva, Visita técnica ou Outro), o <b>técnico</b> e a <b>data e hora</b> do agendamento. O <b>checklist</b> muda conforme o tipo.',
    'Descreva o <b>defeito ou serviço solicitado</b>.',
    'Adicione as <b>peças, o gás e os serviços</b>. O cilindro de gás é escolhido automaticamente.',
    'Clique em <b>Salvar</b>. A OS fica como <i>Agendada</i>.',
  ]),
  FIG('09-os-lista', { 1: 'Busca.', 2: 'Lista de OS com a situação de cada uma.', 3: 'Nova OS.' }),
  FIG('10-os', { 1: 'Cliente da OS.', 2: 'Técnico responsável.', 3: 'Peças, gás e serviços, com o total.' }),
  PASSOS('Atender e concluir', [
    'No dia, o técnico abre a OS e clica em <b>Iniciar atendimento</b>.',
    'Durante o serviço, marca o <b>checklist</b> (fixação, vácuo, teste de estanqueidade, ligação elétrica, dreno, funcionamento e instrução ao cliente).',
    'Escreve o <b>laudo</b>, tira <b>fotos</b> e colhe a <b>assinatura</b> do cliente na tela.',
    'Clique em <b>Concluir OS</b>.',
    'Se tudo estiver certo, o escritório clica em <b>Faturar OS</b> para gerar a cobrança no Financeiro.',
  ]),
  FIG('10b-os-laudo', { 1: 'Laudo do técnico. Abaixo ficam as fotos e os botões: <b>Cupom</b>, <b>PDF</b>, <b>WhatsApp</b>, <b>Salvar</b>, <b>Iniciar atendimento</b>, <b>Concluir OS</b> e <b>Cancelar OS</b>.' }),
  ATENCAO('O <b>estoque e o gás só baixam quando a OS é concluída</b>, e não quando ela é criada. Por isso, conclua a OS no mesmo dia do serviço.'),
  DICA('O <b>técnico</b> enxerga só as suas próprias OS e a agenda do dia, e não vê custos nem lucro.'),
]);

cap('estoque', 'Estoque e entrada de mercadoria', 'Cadastre produtos e serviços, dê entrada nas compras e acompanhe o que está acabando.', [
  PASSOS('Cadastrar um produto ou serviço', [
    'Clique em <b>Estoque</b> e depois em <b>Novo produto</b>.',
    'Escolha o <b>tipo</b>: peça, serviço ou gás refrigerante.',
    'Preencha <b>descrição</b>, <b>código</b>, <b>custo</b>, <b>preço de venda</b> e o <b>estoque mínimo</b> (abaixo dele o sistema avisa no Painel).',
    'Clique em <b>Salvar</b>.',
  ]),
  FIG('11-estoque', { 1: 'Abas: <b>Produtos e serviços</b>, <b>Entrada de mercadoria</b> e <b>Movimentações</b>.', 2: 'Busca.', 3: 'Lista com o saldo de cada item.', 4: 'Novo produto.' }),
  FIG('12-produto-novo', {}),
  P('<b>Serviço</b> não controla estoque (instalação, limpeza, visita técnica). Só peças e gás têm saldo.'),
  PASSOS('Dar entrada numa compra', [
    'Abra a aba <b>Entrada de mercadoria</b>.',
    '<b>Opção 1, pelo XML da nota fiscal:</b> clique em <b>Importar XML da NF-e</b> e escolha o arquivo que o fornecedor mandou. O sistema lê todos os itens, liga aos seus produtos e já cria as contas a pagar.',
    '<b>Opção 2, manual:</b> clique em <b>Entrada manual</b>, informe o fornecedor e os itens com quantidade e custo.',
    'Confira e confirme. O saldo do estoque sobe na hora.',
  ]),
  FIG('13-estoque-entrada', { 1: 'Abas. Em <b>Entrada de mercadoria</b> estão os botões de XML e de lançamento manual, e as últimas entradas.' }),
  P('A aba <b>Movimentações</b> mostra tudo que entrou e saiu de cada produto (compra, venda, devolução, OS), com data e quem lançou.'),
]);

cap('gas', 'Gás refrigerante', 'O gás é controlado por cilindro, em quilos. Assim você sabe exatamente quanto sobrou em cada um.', [
  P('Cada cilindro tem o seu saldo em <b>kg</b>. O estoque do produto de gás é a <b>soma dos cilindros</b>. Na venda ou na OS, o sistema escolhe o cilindro sozinho: primeiro o <b>da loja</b> e, depois, o menor que tenha gás suficiente.'),
  PASSOS('Cadastrar um cilindro', [
    'Clique em <b>Gás refrigerante</b> e depois em <b>Novo cilindro</b>.',
    'Informe o <b>tipo de gás</b> (R-410A, R-22…), o <b>número do cilindro</b>, a <b>capacidade em kg</b>, o <b>saldo</b> que ele tem agora e o <b>local</b> onde está.',
    'Quando você dá entrada numa nota fiscal de gás, o sistema já cria os cilindros automaticamente.',
  ]),
  FIG('14-gas', { 1: 'Novo cilindro.', 2: 'Lista de cilindros com o saldo em kg.' }),
  DICA('O sistema avisa quando um <b>mesmo equipamento recebe 3 ou mais cargas de gás em 12 meses</b>. É sinal de vazamento: vale avisar o cliente.'),
]);

cap('clientes', 'Clientes e equipamentos', 'Guarde os dados do cliente e os aparelhos dele. Isso ajuda a lembrar manutenções e a conferir garantia.', [
  PASSOS('Cadastrar um cliente', [
    'Clique em <b>Clientes</b> e depois em <b>Novo cliente</b>.',
    'Preencha <b>nome</b>, <b>telefone</b>, e-mail, CPF/CNPJ e endereço.',
    'Clique em <b>Salvar</b>. Você também pode cadastrar o cliente na hora, dentro da venda, do orçamento ou da OS.',
  ]),
  FIG('15-clientes', { 1: 'Busca por nome ou telefone.', 2: 'Lista de clientes.', 3: 'Novo cliente.' }),
  P('Ao abrir um cliente, você vê a <b>ficha completa</b>: dados, equipamentos, ordens de serviço, orçamentos e compras.'),
  FIG('16-cliente-ficha', { 1: '<b>+ Equipamento</b>: cadastra o aparelho (marca, modelo, BTUs, série, local e garantia).', 2: 'Abre uma conversa no <b>WhatsApp</b> com o cliente.', 3: 'Editar os dados do cliente.' }),
  DICA('O Painel e a ficha ajudam a lembrar o cliente da <b>manutenção preventiva</b> (a cada 6 meses, por padrão). A mensagem pronta pode ser editada em Configurações.'),
]);

cap('financeiro', 'Financeiro e relatórios', 'Contas a receber, contas a pagar, caixa do dia e os números da loja.', [
  PASSOS('Usar o financeiro', [
    'Clique em <b>Financeiro</b>. As abas separam o que você tem <b>a receber</b>, o que tem <b>a pagar</b> e o <b>caixa do dia</b>.',
    'Para lançar algo avulso (aluguel, energia, serviço sem OS), clique em <b>Novo lançamento</b>.',
    'Quando o dinheiro entrar ou sair, clique em <b>dar baixa</b> na linha do lançamento, escolha a <b>forma</b> e a <b>data</b> e confirme.',
    'Use os filtros para ver o que está <b>vencido</b>, o que já foi <b>pago</b> e o que vence nos próximos dias.',
  ]),
  FIG('17-financeiro', { 1: 'Abas: a receber, a pagar e caixa.', 2: 'Novo lançamento.', 3: 'Lançamentos com valor, vencimento e situação.' }),
  ATENCAO('As vendas a prazo, as OS faturadas e as entradas por XML criam as contas <b>sozinhas</b>. Não lance de novo à mão para não duplicar.'),
  PASSOS('Ver os relatórios', [
    'Clique em <b>Relatórios</b> e escolha a aba: vendas por vendedor (comissão), lucro, estoque e outros.',
    'Escolha o <b>período</b> nas datas.',
    'Use o botão de exportar para baixar os dados.',
  ]),
  FIG('18-relatorios', { 1: 'Abas de relatórios.', 2: 'Período.', 3: 'Exportar.' }),
]);

cap('admin', 'Administração (para o responsável da loja)', 'Telas do perfil master e do supervisor: usuários, configurações da loja, impressora e histórico de ações.', [
  PASSOS('Criar um usuário', [
    'Clique em <b>Usuários</b> e depois em <b>Novo usuário</b>.',
    'Informe o <b>login</b> (3 a 30 letras ou números, sem espaço), o <b>nome</b>, o <b>perfil</b> e uma <b>senha provisória</b>.',
    'Entregue o login e a senha provisória à pessoa. No primeiro acesso, ela é obrigada a criar uma senha própria.',
    'Para tirar o acesso de alguém, <b>desative</b> o usuário. Para quem esqueceu a senha, use <b>redefinir senha</b>.',
  ]),
  FIG('19-usuarios', { 1: 'Novo usuário.', 2: 'Lista com perfil e situação. O master principal não pode ser desativado.' }),
  PASSOS('Configurar a loja', [
    'Clique em <b>Configurações</b>.',
    'Preencha o <b>nome</b>, CNPJ, telefone e endereço. Eles aparecem nos PDFs, no menu e nos cupons.',
    'Defina a <b>margem padrão</b>, a validade dos orçamentos e o intervalo de manutenção.',
    'Ajuste as <b>mensagens</b> do WhatsApp (orçamento e manutenção). Elas aceitam campos como <i>{cliente}</i> e <i>{total}</i>.',
    'Clique em <b>Salvar configurações</b>.',
  ]),
  FIG('20-config', { 1: 'Dados da loja.', 2: 'Margem padrão, validade e manutenção.', 3: 'Mensagem do orçamento enviada no WhatsApp.' }),
  PASSOS('Ligar a impressora térmica de cupom', [
    'Instale o driver da impressora no Windows (Bematech MP-4200 TH ou similar) e deixe-a ligada.',
    'Em <b>Configurações</b>, no cartão <b>Impressora térmica</b>, escolha como ela está ligada: <b>Térmica USB</b>, <b>Térmica na rede (IP)</b> ou <b>Impressora comum</b>.',
    'Escolha a impressora na lista, a largura do papel (<b>80 mm</b> ou 58 mm) e se deve <b>cortar o papel</b> e <b>abrir a gaveta</b>.',
    'Clique em <b>Salvar impressora</b> e depois em <b>Imprimir teste</b>.',
  ]),
  FIG('21-config-impressora', { 1: 'Como a impressora está ligada.', 2: 'Salvar a impressora.', 3: 'Imprimir um cupom de teste.' }),
  DICA('Marque <b>Imprimir o cupom automaticamente ao finalizar a venda</b> para sair o cupom sem clicar em nada.'),
  P('<b>Auditoria:</b> a tela <b>Auditoria</b> registra quem fez o quê e quando (entrou no sistema, fez venda, cancelou, mudou configuração). Serve para tirar dúvidas e dar segurança.'),
  FIG('23-auditoria', { 1: 'Histórico de ações, da mais recente para a mais antiga.' }),
]);

cap('backup', 'Backup: como proteger os dados da loja', 'Tudo o que a loja registra fica no computador. Se ele queimar, for roubado ou der pane, os dados só voltam se existir uma cópia fora dele.', [
  P('O FrioGest faz <b>um backup automático por dia</b> e guarda os últimos 30. Essas cópias ficam na pasta <b>Documentos\\FrioGest\\Backups</b>, no mesmo computador. Por isso existe a <b>cópia externa</b>: o sistema copia cada backup também para um pendrive, HD externo ou para a pasta do Google Drive.'),
  ATENCAO('Sem a cópia externa, se o HD queimar, os dados <b>e</b> os backups somem juntos. Configure a cópia externa no dia da instalação.'),
  PASSOS('Configurar a cópia externa', [
    'Clique em <b>Backup</b>. Enquanto não houver cópia externa, o sistema mostra um <b>aviso amarelo</b> no topo de todas as telas.',
    '<b>Para usar o Google Drive:</b> instale o programa <i>Google Drive para computador</i>, entre com a conta da loja e crie uma pasta dentro de <i>Meu Drive</i>, por exemplo <b>FrioGest-Backup</b>.',
    'No FrioGest, clique em <b>Escolher pasta…</b> (ou digite o caminho, como <b>G:\\Meu Drive\\FrioGest-Backup</b>). Para pendrive ou HD externo, escolha uma pasta dentro dele.',
    'Clique em <b>Salvar e copiar agora</b>. O sistema testa a pasta e já faz a primeira cópia.',
  ]),
  FIG('22-backup-aviso', { 1: 'Aviso: os backups estão só neste computador.', 2: 'Caminho da pasta da cópia externa.', 3: 'Salva e faz a primeira cópia.', 4: '<b>Fazer backup agora</b>: cria um backup na hora.' }),
  P('Depois de configurado, a tela mostra <b>Cópia externa em dia</b> e a lista dos backups. A faixa de aviso some.'),
  FIG('22b-backup-em-dia', { 1: 'Situação da cópia externa.', 2: 'Pasta de destino.', 3: 'Backups guardados no computador. <b>baixar</b> salva uma cópia do arquivo.' }),
  TAB(['O que você vê', 'O que significa', 'O que fazer'], [
    ['Faixa amarela no topo', 'Nenhuma cópia externa configurada.', 'Configure a pasta, como acima.'],
    ['Faixa vermelha no topo', 'Faz mais de 2 dias que a cópia externa não é feita (pendrive fora, Drive fechado, pasta apagada).', 'Conecte o pendrive ou abra o Google Drive e clique em <b>Fazer backup agora</b>.'],
    ['Nenhuma faixa', 'Tudo em dia.', 'Nada.'],
  ]),
  DICA('Para ficar ainda mais seguro, configure a cópia no <b>Google Drive</b> e, de vez em quando, copie a pasta de backups para um <b>pendrive</b> guardado fora da loja.'),
  PASSOS('Se o computador quebrar: recuperar os dados', [
    'Instale o FrioGest no computador novo (com o mesmo instalador).',
    'Pegue o <b>backup mais recente</b> na cópia externa (pendrive ou Google Drive).',
    'Abra o FrioGest uma vez e feche. Isso cria a pasta do banco.',
    'Copie o arquivo de backup para a pasta do banco, <b>C:\\Users\\(seu usuário)\\AppData\\Roaming\\FrioGest</b>. A pasta exata aparece em <b>Configurações &gt; Onde ficam os dados</b>.',
    'Renomeie o arquivo para <b>friogest.db</b>, substituindo o atual. Apague os arquivos <b>friogest.db-wal</b> e <b>friogest.db-shm</b>, se existirem.',
    'Abra o FrioGest. Confira o caixa, o estoque e as vendas do último dia.',
  ]),
  P('Se tiver dúvida em qualquer passo, <b>não apague nada</b>: chame o suporte. Os backups continuam guardados.'),
]);

cap('duvidas', 'Dúvidas frequentes', 'Respostas rápidas para os problemas mais comuns.', [
  TAB(['Pergunta', 'Resposta'], [
    ['O sistema precisa de internet?', 'Não. Ele roda no computador da loja. A internet só é usada para o WhatsApp e para a cópia de segurança no Google Drive.'],
    ['O sistema emite nota fiscal?', '<b>Não.</b> O cupom e o recibo são <b>comprovantes não fiscais</b>. A nota fiscal continua sendo emitida no programa que a loja usa hoje.'],
    ['Esqueci a senha.', 'Peça ao master para abrir <b>Usuários</b> e usar <b>redefinir senha</b>. Você cria uma senha nova no próximo acesso.'],
    ['Não consigo vender um produto.', 'Veja se há saldo em <b>Estoque</b>. Sem saldo, o sistema bloqueia. Dê entrada na mercadoria primeiro.'],
    ['A venda foi lançada errada.', 'Abra a venda em <b>Vendas</b> e use <b>Devolver itens</b> ou <b>Cancelar venda</b> (perfil com permissão). O estoque volta sozinho.'],
    ['O cupom não imprime.', 'Confira se a impressora está ligada e com papel, e teste em <b>Configurações &gt; Imprimir teste</b>. Se o teste falhar, reconecte o cabo USB e reinicie o FrioGest.'],
    ['Apareceu a faixa vermelha de backup.', 'A cópia externa está atrasada. Conecte o pendrive ou abra o Google Drive e clique em <b>Fazer backup agora</b>.'],
    ['Vários computadores usam o mesmo sistema?', 'Sim, em rede local. O responsável liga o <b>modo rede</b> em Configurações e reinicia o programa. Os outros acessam pelo endereço mostrado lá.'],
    ['Quem alterou ou apagou algo?', 'A tela <b>Auditoria</b> mostra todas as ações, com o usuário e o horário.'],
  ]),
  P('<b>Atalhos úteis:</b> <b>F2</b> busca um produto na venda · <b>F10</b> finaliza a venda · <b>Esc</b> sai do tour guiado.'),
]);

// ---------------------------------------------------------------- HTML
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CSS = `
:root{--bg:#F3F6FA;--surface:#FFFFFF;--ink:#13233A;--muted:#55667E;--line:#CBD5E2;--az:#1F5FBF;--az-bg:#E3EEFC;--am:#8A4B00;--am-bg:#FDF0DA;--vm:#B3261E;--vm-bg:#FCE6E3;--ve:#1B7547;--ve-bg:#E0F4E8;--navy:#0F2744;
  --sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'IBM Plex Mono',ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E1726;--surface:#14203A;--ink:#E7EEF8;--muted:#9AABC3;--line:#2C3C57;--az:#6BA6FF;--az-bg:#14284A;--am:#F2A444;--am-bg:#3A2A10;--vm:#FF8A80;--vm-bg:#411B1A;--ve:#5ED39A;--ve-bg:#10372A;--navy:#0B1A30;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E1726;--surface:#14203A;--ink:#E7EEF8;--muted:#9AABC3;--line:#2C3C57;--az:#6BA6FF;--az-bg:#14284A;--am:#F2A444;--am-bg:#3A2A10;--vm:#FF8A80;--vm-bg:#411B1A;--ve:#5ED39A;--ve-bg:#10372A;--navy:#0B1A30;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.65;margin:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0}
.wrap{max-width:900px;margin:0 auto}
.capa{background:var(--navy);color:#fff;border-radius:0 0 18px 18px;padding:54px clamp(20px,5vw,48px) 40px;margin:0 calc(-1 * max(16px,env(safe-area-inset-left,0px)))}
.capa .k{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8FB8FF}
.capa h1{font-size:clamp(32px,6vw,52px);line-height:1.08;margin:10px 0 12px;text-wrap:balance;letter-spacing:-.015em}
.capa p{color:#C5D5EC;max-width:56ch;margin:0}
.capa .v{margin-top:22px;font-size:13px;color:#8FB8FF;font-family:var(--mono)}
.sumario{margin:30px 0 8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px 22px}
.sumario h2{font-size:15px;margin:0 0 8px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:500;border:0;padding:0}
.sumario ol{margin:0;padding-left:22px;columns:2;column-gap:32px}
.sumario li{break-inside:avoid;margin:3px 0}
.sumario a{color:var(--az);text-decoration:none}.sumario a:hover{text-decoration:underline}
.cap{padding-top:34px}
.cap>h2{font-size:clamp(24px,4vw,30px);line-height:1.2;margin:0 0 6px;display:flex;gap:14px;align-items:baseline;padding-top:22px;border-top:2px solid var(--line)}
.cap>h2 .n{font-family:var(--mono);font-size:.6em;color:var(--az);background:var(--az-bg);padding:2px 9px;border-radius:6px}
.intro{color:var(--muted);margin:0 0 18px;max-width:64ch}
.p{margin:14px 0}
.passos{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:16px 0}
.passos h3{font-size:17px;margin:0 0 10px}
.passos ol{margin:0;padding:0;list-style:none;counter-reset:p;display:grid;gap:10px}
.passos li{counter-increment:p;display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start}
.passos li::before{content:counter(p);background:var(--az);color:#fff;font:600 13px/26px var(--sans);width:26px;height:26px;text-align:center;border-radius:50%;margin-top:1px}
figure{margin:18px 0;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;break-inside:avoid}
figure img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--line)}
.leg{margin:12px 4px 2px;padding:0;list-style:none;display:grid;gap:6px;font-size:14.5px}
.leg li{display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start}
.leg b.m{background:#e11d48;color:#fff;font:700 13px/24px var(--sans);width:24px;height:24px;text-align:center;border-radius:50%}
figcaption{font-size:13px;color:var(--muted);margin:8px 4px 2px}
.box{border-radius:10px;padding:12px 16px;margin:16px 0;border-left:5px solid}
.box.dica{background:var(--az-bg);border-color:var(--az)}
.box.atencao{background:var(--am-bg);border-color:var(--am)}
.box b.t{display:block;font-family:var(--mono);font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;margin-bottom:2px}
.box.dica b.t{color:var(--az)}.box.atencao b.t{color:var(--am)}
.tw{overflow-x:auto;margin:16px 0;background:var(--surface);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
th{font-family:var(--mono);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500;background:var(--bg)}
td:first-child{font-weight:600;min-width:150px}
ul.l{margin:12px 0;padding-left:22px}
footer{margin:46px 0 40px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
@media (max-width:640px){.sumario ol{columns:1}}
@media print{
  :root:root:root{--bg:#F3F6FA;--surface:#FFFFFF;--ink:#13233A;--muted:#55667E;--line:#CBD5E2;--az:#1F5FBF;--az-bg:#E3EEFC;--am:#8A4B00;--am-bg:#FDF0DA;--vm:#B3261E;--vm-bg:#FCE6E3;--ve:#1B7547;--ve-bg:#E0F4E8;--navy:#0F2744;color-scheme:light}
  body{background:#fff;color:#000;font-size:11.5pt;padding:0}
  .capa{border-radius:0;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-after:page}
  .cap{break-before:page;padding-top:0}.cap>h2{border-top:0;padding-top:0}
  figure,.passos,.box,.tw{break-inside:avoid}
  .passos li::before,.leg b.m,.box,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sumario a{color:#000}
}
`;

function fig(b) {
  const p = prints[b.img]; if (!p) return '';
  const desenhadas = new Set(p.marcas);
  const itens = Object.entries(b.legenda).filter(([n]) => desenhadas.has(+n)).map(([n, t]) => `<li><b class="m">${n}</b><span>${t}</span></li>`).join('');
  return `<figure><img loading="lazy" alt="${esc(p.titulo)}" src="data:image/jpeg;base64,${b64(b.img)}">${itens ? `<ul class="leg">${itens}</ul>` : ''}<figcaption>${esc(p.titulo)}</figcaption></figure>`;
}
function bloco(b) {
  switch (b.t) {
    case 'p': return `<p class="p">${b.x}</p>`;
    case 'passos': return `<div class="passos"><h3>${b.titulo}</h3><ol>${b.itens.map(i => `<li><span>${i}</span></li>`).join('')}</ol></div>`;
    case 'fig': return fig(b);
    case 'dica': return `<div class="box dica"><b class="t">Dica</b>${b.x}</div>`;
    case 'atencao': return `<div class="box atencao"><b class="t">Atenção</b>${b.x}</div>`;
    case 'lista': return `<ul class="l">${b.itens.map(i => `<li>${i}</li>`).join('')}</ul>`;
    case 'tab': return `<div class="tw"><table><thead><tr>${b.cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${b.linhas.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    default: return '';
  }
}

const data = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const corpo = `<div class="wrap">
<header class="capa"><div class="k">Manual do usuário</div><h1>FrioGest</h1><p>Vendas, orçamentos, estoque, gás refrigerante, ordens de serviço e financeiro da sua loja de refrigeração. Passo a passo, com as telas do sistema.</p><div class="v">Versão 1.0 · ${esc(data)}</div></header>
<nav class="sumario" aria-label="Sumário"><h2>Neste manual</h2><ol>${C.map(c => `<li><a href="#${c.id}">${c.titulo}</a></li>`).join('')}</ol></nav>
${C.map((c, i) => `<section class="cap" id="${c.id}"><h2><span class="n">${String(i + 1).padStart(2, '0')}</span>${c.titulo}</h2><p class="intro">${c.intro}</p>${c.blocos.map(bloco).join('\n')}</section>`).join('\n')}
<footer>Os nomes de clientes, produtos e valores das imagens são exemplos. Em caso de dúvida, procure o responsável pelo sistema na sua loja.</footer>
</div>`;
const head = `<title>Manual do FrioGest</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">\n<style>${CSS}</style>`;
fs.writeFileSync(path.join(DIR, 'Manual-FrioGest.fragmento.html'), `${head}\n${corpo}\n`);
fs.writeFileSync(path.join(DIR, 'Manual-FrioGest.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n${head}</head><body>${corpo}</body></html>`);
const usadas = new Set(C.flatMap(c => c.blocos).filter(b => b.t === 'fig').map(b => b.img));
const sem = Object.keys(prints).filter(k => !usadas.has(k));
console.log(`Manual: ${C.length} capítulos, ${usadas.size} imagens, ${(fs.statSync(path.join(DIR, 'Manual-FrioGest.html')).size / 1048576).toFixed(1)} MB`);
if (sem.length) console.log('Imagens não usadas:', sem.join(', '));
for (const c of C) for (const b of c.blocos) if (b.t === 'fig' && prints[b.img]) { const falta = Object.keys(b.legenda).filter(n => !prints[b.img].marcas.includes(+n)); if (falta.length) console.log(`  ${b.img}: legenda ${falta.join(',')} sem marcação na imagem (omitida)`); const sobra = prints[b.img].marcas.filter(n => !(n in b.legenda)); if (sobra.length) console.log(`  ${b.img}: marcação ${sobra.join(',')} sem legenda!`); }
