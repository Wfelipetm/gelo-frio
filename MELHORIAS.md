# FrioGest — lista de melhorias

Pendências e ideias anotadas durante os testes de 25/11/2026. `[x]` = feito (ainda não publicado até alguém fazer o push na `main`).

## Feitas
- [x] **Entrada por XML reconhece gás.** Pela descrição (GAS/CIL + R410A, R22, R32, R134A…) ou unidade CIL; tira o peso do cilindro do texto (11,34KG); vincula ao produto de gás do mesmo tipo ou cria um novo com o tipo e o peso; a quantidade da nota vira nº de cilindros (nota em kg é convertida); preço sugerido por kg.
- [x] **Gás dividido entre cilindros.** Venda/OS que não cabe num cilindro completa com outros (loja primeiro, esvaziando os menores); a devolução volta o kg ao cilindro de onde saiu. Em "Últimos usos", o ajuste aparece como "+1 kg" (verde) e o consumo como "−2 kg" (vermelho).
- [x] **Relatórios contam as OS faturadas** ("Vendedores e comissão" ganhou a coluna OS faturadas e soma vendas + OS; "Lucro por produto" inclui os itens das OS), com a mesma regra do Painel.
- [x] **OS como folha de serviço.** Endereço do atendimento (rua, bairro, complemento, referência, contato e telefone), prioridade (urgente), instruções para o técnico; impressão para o técnico **sem preços**, com espaços para preencher à mão (peças usadas, chegada e saída, laudo, assinaturas) e via do cliente com valores. Cupom da OS também.
- [x] **OS: item livre** (mão de obra, deslocamento, material) para quem gerencia; **assinatura e nome de quem recebeu aparecem na tela** da OS concluída; **várias fotos de uma vez**; OS concluída/cancelada **não aceita foto** nem remoção (também no servidor); **"Faturar agora"** dentro do "Concluir OS" (forma de pagamento e vencimento na hora).
- [x] **Perfil técnico**: não vê preços nem o total da OS e não tem a lista de clientes; segue vendo Estoque e Gás para consulta. (Decisão tomada por padrão; ajustar em `server/services.js` se o dono quiser outra coisa.)
- [x] **Financeiro**: aba **Contas fixas** (aluguel, luz, internet… lançadas sozinhas uma vez por mês, com dia, valor, pausar/excluir); **estorno** de venda identificado com etiqueta (não parece mais "A pagar" comum); Painel com **contas vencidas e dos próximos 7 dias**.
- [x] **Backup**: botão **Restaurar** (valida o arquivo, guarda o estado atual, troca o banco e reinicia); erros da cópia externa em português; a faixa do topo avisa **já na primeira falha**.
- [x] **Estoque**: filtro **Inativos** com "reativar"; entrada manual já vem com **conta a pagar marcada** e parcela de 30 dias (o valor acompanha a quantidade e o custo).
- [x] **Login**: bloqueio por **usuário + IP** com tempo dobrando (1, 2, 4… até 15 min), para ninguém travar o master de outro computador.
- [x] **WhatsApp como ícone** na ficha do cliente, na OS e no Painel (em vez do texto).
- [x] Cache do Electron/electron-builder no workflow de publicação; `CLAUDE.md` reescrito (publicação automática, atualizador, perfis, regras novas).
- [x] Decididos antes: assinatura da OS fica como está (campos no PDF); sem link do Google Maps na OS.

## Dependem de decisão do dono
- [ ] **Cartão (crédito/débito) entra no caixa na hora, sem taxa nem prazo.** Na prática a maquininha desconta taxa e o crédito cai em ~30 dias. Decidir: taxa por forma de pagamento (configurável) e data prevista de recebimento.
- [ ] **Custo do produto = último custo informado** (sem custo médio). Muda o lucro dos relatórios. Decidir: último custo ou custo médio ponderado.
- [ ] **Perfil técnico**: confirmar se ele deve mesmo ver Estoque e Gás (hoje vê, só para consulta).
- [ ] **Tour guiado tem 28 passos** (para o master): considerar dividir por área e mostrar só o que o perfil usa.

## Dependem de conta/serviço externo ou de mim fora do código
- [ ] **NFC-e/NF-e** por API (Focus NFe, NFE.io, PlugNotas…): certificado A1, CSC, NCM/CFOP/CSOSN por produto, regime tributário.
- [ ] **Assinatura digital do instalador** (o Windows avisa "protegeu o seu PC"): precisa de certificado de assinatura de código.
- [ ] Apagar no GitHub os dois rascunhos antigos de Release "1.0.1" (só o dono do repositório consegue).
- [ ] Refazer o PDF de proposta e o vídeo do cliente (ainda citam link de aprovação, acesso de qualquer lugar, backup em nuvem e NFC-e).
- [ ] Testar o cupom novo na **Bematech MP-4200 TH real** (42 colunas, hora local; se os acentos saírem trocados, usar PC860).
- [ ] Regenerar o manual (`npm run manual`) e a pasta `Instalar-FrioGest/` (`npm run pacote`) depois de publicar, para o manual mostrar as telas novas.

## Pequenas pendências técnicas
- [ ] O teste automático de interface (e2e) falhou em várias telas numa rodada e passou inteiro na seguinte: investigar a instabilidade.
- [ ] O quadro de assinatura apareceu vazio no teste depois da assinatura automática (só no teste; conferir no uso real).
