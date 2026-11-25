# FrioGest — relatório dos testes passo a passo

**Data:** 25/11/2026 · **Versão de base:** 1.0.15 · **Quem testou:** o dono (telas, importação de XML, edição de cliente) e Claude (cadastros, bateria automática em Chrome visível).

## 1. Como foi testado
- Janela do **Chrome separada**, com **banco temporário** e dados de exemplo. **Nenhum dado real da loja foi tocado.**
- Impressora térmica **falsa** (captura os bytes) e links do **WhatsApp interceptados** (nada foi enviado).
- Não dá para testar nesse ambiente: PDF salvo em arquivo (só no programa instalado), impressão real na Bematech e fotos da OS.

## 2. Resultado por etapa

| Etapa | Quem fez | Resultado |
|---|---|---|
| Login, troca da senha provisória e passeio guiado | Dono | OK |
| Cadastro de 3 produtos (peça, serviço e gás) | Claude | OK |
| Entrada de mercadoria por XML da NF-e (4 itens, R$ 3.880,00, 2 parcelas) | Dono | OK, com 1 problema no gás (item 1 abaixo) |
| Cliente e equipamento (cadastro e edição) | Claude e dono | OK |
| Orçamento: editar, desconto, item livre, calculadora de BTUs, trocar cliente, salvar, cupom, PDF, WhatsApp, recusar, aprovar e converter em venda e em OS | Claude | **18 de 18 OK** |
| Ordem de serviço: técnico, item, iniciar, laudo, concluir, estoque, faturar, PDF, WhatsApp, cupom | Claude | **12 de 12 OK** |
| PDV e vendas: dinheiro com troco, fiado (com e sem cliente), peça + serviço, crédito/débito/boleto, estoque insuficiente, limpar, salvar como orçamento, lista, cupom, recibo, etiqueta, devolução e cancelamento | Claude | **13 de 13 OK** (1 falha inicial foi do meu roteiro e foi refeita na venda certa) |
| Gás: cilindro cheio e parcial, ajuste de saldo, venda no PDV (baixa do cilindro da loja), venda maior que o cilindro, devolução, alerta de vazamento (3 cargas), estoque = soma dos cilindros, histórico de usos | Claude | **12 de 12 OK**, com 1 limite importante (item 9) |
| Usuários e perfis: criar vendedor, usuário repetido, master protegido, troca obrigatória da senha, menu e telas por perfil, APIs de admin (403), sem custo para vendedor, só as próprias vendas e OS, técnico inicia/conclui a própria OS, desativar derruba a sessão, reset de senha, bloqueio após 5 erros | Claude (janelas anônimas separadas) | **18 de 18 OK** |
| Backup: tela, fazer backup, baixar, faixa do topo com x, pasta externa (válida, igual à do banco, dentro do banco, relativa, vazia, sumida), desligar, integridade e restauração simulada | Claude | **13 de 13 OK** (o arquivo de backup é íntegro e abre num segundo sistema com os mesmos dados) |
| Estoque: busca, filtros, ajuste (+, perda, devolução ao fornecedor), histórico, editar preço/mínimo, aviso de mínimo, código repetido, desativar, movimentações, entrada manual com conta a pagar, nota repetida, exportar CSV | Claude | **14 de 14 OK** (2 partes foram refeitas por erro do meu roteiro) |
| Checklist, fotos e tour: checklist por tipo de serviço, marcar e salvar, fotos (envio, abrir, reduzir foto gigante, arquivo inválido, remover), PDF com checklist e fotos, OS concluída, tour de 28 passos (avançar, voltar, Esc) | Claude | **12 de 12 funcionam**; 1 limitação encontrada (uma foto por vez) |
| Financeiro: a receber vencida e futura, filtros, baixa, excluir, a pagar, caixa do dia, relatórios, painel | Claude | **11 de 11 OK** (a 1ª rodada falhou por erro do meu roteiro, não do sistema) |

Conferências que fecharam certo (PDV): venda em dinheiro de 3 capacitores com 10% de desconto = R$ 92,45 e troco de R$ 7,55 com R$ 100 recebidos; fiado sem cliente é barrado; fiado com cliente gera a conta a receber (vencimento em 20 dias); serviço não mexe no estoque; venda de 999 unidades é barrada ("disponível: 22 un"); devolução de 1 item estorna R$ 30,82 e o estoque volta; cancelar a venda de R$ 730,80 devolve o tubo ao estoque; o caixa do dia fecha com as entradas e saídas.

Outras conferências: estoque do capacitor 30 → 28 (venda) → 26 (OS concluída, só ao concluir); gás e peças só baixam ao concluir a OS; caixa do dia bate com o banco; OS faturada gera a conta a receber de R$ 449,28.

## 3. O que achamos e precisa melhorar

### Prioridade alta
1. **XML da NF-e: o gás entra como produto comum.** O item "GAS R410A CIL 11,34KG" (unidade CIL) virou "2 un" e **não criou os cilindros**; o gás do cadastro ficou em 0 kg. Só vira gás se for vinculado à mão a um produto de gás. Deve reconhecer gás sozinho (unidade CIL, descrição com GAS/R410A/R22/R32), propor o tipo e o peso e criar os cilindros.
2. **Relatórios não contam as OS.** O Painel mostrou vendas do dia de R$ 517,76 (com R$ 449,28 de OS), mas "Vendedores e comissão" e "Lucro por produto" mostraram só R$ 68,48. Painel e relatórios precisam seguir a mesma regra.
3. **OS como folha de serviço para o técnico (visão do dono).** O master preenche tudo e imprime; o técnico entende sozinho. Falta: endereço do atendimento próprio da OS (rua, número, bairro, complemento, ponto de referência, contato no local), data e horário no papel, instruções para o técnico, versão **sem preços** para o técnico, e espaços para preencher à mão (laudo, chegada e saída, peças usadas, assinaturas). Link do Google Maps foi **descartado** (é papel).

### Prioridade média
4. **OS não tem "item livre"** (mão de obra, deslocamento). O orçamento tem. Conferir também se a conversão orçamento → OS mantém itens livres.
5. **Financeiro: automatizar o que é manual.** Despesas fixas recorrentes (aluguel, luz, internet), faturar a OS sozinha ao concluir (hoje depende do clique em "Faturar") e lista de "contas vencendo hoje e esta semana" no Painel.
6. **Ficha do cliente:** trocar o texto "WhatsApp" por um **ícone** ao lado do telefone (e nas outras telas onde o texto aparece).

### Prioridade baixa
7. **Assinatura na OS:** decidido que **fica como está** (o PDF já traz os campos para assinar no papel). Pendências pequenas: o quadro apareceu vazio depois da assinatura automática (conferir) e a assinatura não aparece na tela depois de concluir, só no PDF.
8. **Caixa do dia, por forma de pagamento:** mostra o saldo líquido (entradas menos saídas), então o Pix apareceu como **−R$ 682,24**. Pode confundir; avaliar mostrar entradas e saídas separadas.

9. **Cartão entra no caixa na hora, sem taxa nem prazo** (crédito virou "recebido" no mesmo dia pelo valor cheio).
10. **Devolução e cancelamento aparecem como "A pagar"** (estorno lançado como saída paga); o caixa fecha certo, mas a aba pode confundir.

11. **Gás: a venda e a OS não dividem o kg entre cilindros.** Com dois cilindros de 6 kg e 2,3 kg, a venda de 7 kg foi bloqueada; deve completar com mais de um cilindro. O ajuste de saldo também aparece como "uso de −1 kg" (confuso).

12. **Perfil técnico:** o menu mostra Estoque, Gás e Clientes (todos), e a OS mostra valores em R$, embora a descrição diga "apenas as próprias OS (sem custos)". Confirmar o que ele deve ver.
13. **Bloqueio de login por usuário:** quem tem acesso à rede pode travar o `master` por 1 minuto repetidamente (baixa prioridade).

14. **Backup sem botão "Restaurar":** restaurar é manual (fechar o programa, copiar e renomear o arquivo). Arriscado para o cliente; criar o botão com confirmação, cópia do banco atual e reinício.
15. **Cópia externa que falha:** o erro aparece com texto técnico ("ENOTDIR…") e a faixa do topo só avisa depois de 2 dias.

16. **Estoque: produto desativado some e não há como reativar pela tela** (só pela API).
17. **Entrada manual de mercadoria:** a caixa "Lançar contas a pagar" começa desmarcada (no XML vem marcada); quem esquece fica sem a conta a pagar.
18. **Custo do produto = último custo** informado (sem custo médio), o que muda o lucro dos relatórios; decidir qual regra usar.

19. **OS: uma foto por vez** (o campo não aceita escolher várias); **OS concluída** esconde o botão de foto na tela, mas a API ainda aceita.
20. **Tour de 28 passos** é longo; dividir por área e por perfil.

### Técnico e manutenção
21. O teste automático de interface falhou em várias telas numa rodada e passou inteiro na seguinte (55 passos): **instável**, vale investigar.
22. `CLAUDE.md` desatualizado (cita um workflow que não existe e não descreve publicação automática, atualizador, "manter conectado" e a pasta de instalação).
23. Cache de build no GitHub (de ~6 para ~4 min) e apagar os 2 rascunhos antigos da Release "1.0.1".
24. Refazer o PDF de proposta e o vídeo do cliente (citam link de aprovação, acesso remoto, nuvem e NFC-e).
25. Atualizar o manual (`npm run manual`) e a pasta `Instalar-FrioGest/` (`npm run pacote`).

### Maiores (decidir antes de começar)
26. Emissão de **NFC-e/NF-e** por API (certificado A1, CSC, NCM/CFOP/CSOSN por produto, regime tributário).
27. **Assinatura digital do instalador** (o Windows ainda avisa "protegeu o seu PC").

## 4. Decisões do dono nesta sessão
- Assinatura da OS: **manter como está** (PDF para assinar no papel).
- Link do Google Maps na OS: **descartado**.
- Login: **lembrar usuário + manter conectado 30 dias**, sem guardar a senha.
- Tudo o que for visto de errado ou faltando nos testes é **anotado direto** na lista de melhorias.

## 5. Publicado nesta sessão (já nas Releases)
- **1.0.8 a 1.0.15:** atualizador com procura a cada **1 minuto** e selo laranja **NOVA** no menu; faixa de backup só local com **x** (lembra a escolha); **Auditoria paginada** (50 por página); impressora térmica: opções de **42 colunas** e escolha **automática** para a Bematech MP-4200 TH; cupom de teste com a **hora local**.
- Impressão real na Bematech: o teste imprimiu e comunicou; as 48 colunas cortavam o texto (a impressora comporta 42). Falta conferir o cupom novo.

## 6. Feito localmente e ainda **não publicado**
- Login com **"Manter conectado"** e usuário lembrado (30 dias, só o hash do token no banco; sair e desativar o usuário derrubam a sessão). 25 testes de API passam e o teste de interface passou (55 passos).
- Modo de teste **passo a passo** (`npm run test:e2e:passo`).
- `MELHORIAS.md` e este relatório.

## 7. Ainda não testado
- **Impressão real na Bematech** com o cupom novo (42 colunas, hora local): só dá para conferir no computador da impressora.
- **PDF salvo em arquivo** (botões PDF/Recibo no programa instalado): no navegador de teste abre a página de impressão.
- **Instalador e atualização silenciosa** no computador da loja.
