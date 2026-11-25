# FrioGest — contexto do projeto (para continuar no VS Code / Claude Code)

Dono: Aleijado (dev, freelance). Cliente: loja de refrigeração (ar-condicionado). Sistema 100% local (Windows), sem internet obrigatória (a internet só é usada para atualizar o programa).
Idioma da UI e das respostas: **português do Brasil**.

## O que é
PDV/vendas, orçamentos, estoque (entrada manual e por XML de NF-e de compra), gás refrigerante por cilindro (kg), ordens de serviço (OS), financeiro (a receber/pagar, contas fixas, caixa), relatórios, usuários com perfis, auditoria, backup com restauração.

## Arquitetura
- Electron (`electron/main.js`) sobe um servidor Express embutido em 127.0.0.1:3210 (próxima porta livre se ocupada ou reservada pelo Windows) e abre uma janela apontando para ele. `preload.js` expõe `window.friogest` {savePdf, openExternal, restart, update, titleBar…}. Barra de título azul (`titleBarOverlay`).
- Modo rede opcional (0.0.0.0) ligado em Configurações; grava `config.json` {lan, port}; exige reiniciar.
- Banco: SQLite (better-sqlite3, WAL). Esquema em `server/db.js` com `PRAGMA user_version` (v1 esquema, v2 folha de serviço da OS, v3 contas recorrentes; novas versões entram como migrações em `open()`). Banco vivo em userData; backups em Documentos/FrioGest/Backups (`VACUUM INTO`, diário, mantém 30). PDFs em Documentos/FrioGest/PDFs.
- Frontend: JS vanilla com ES modules, rota por hash `#/rota`, `innerHTML` com `esc()`. Uma tela por arquivo em `public/js/views/`. Helpers em `public/js/core.js`.
- Visual: tema "profissional" em `public/css/app.css` (tokens em `:root`, fonte Inter embutida em `public/fonts/` — funciona offline). Menu escuro que recolhe/abre clicando na própria barra; rodapé do menu com usuário e bloco "Versão" (selo laranja **NOVA** quando há atualização).
- **Modo demonstração**: `npm run demo` (navegador) ou `npm run dist:demo` → `dist-demo/FrioGest-Demo-<versão>.exe`. Banco temporário + dados de exemplo (`scripts/seed.js`), login automático, faixa laranja, apaga tudo ao fechar. Liga por `FRIOGEST_DEMO=1` ou `electron/demo.flag`. Não toca em dados reais.
- Ícones: Lucide embutido (offline). `public/js/icons.js` é GERADO por `node scripts/gen-icons.js`; para um ícone novo, adicione o nome em `NAMES`, rode o script e use `icon('nome', tamanho)`. Nada de emoji na UI.

## Publicação e atualização automática
- **Todo push na `main` publica uma versão nova** (`.github/workflows/release.yml`, runner Windows, ~6 min): roda `npm test`, calcula a versão (última tag + patch), `electron-builder --publish never` e `gh release create` com `FrioGest-Setup-<v>.exe`, `.blockmap` e `latest.yml`. Não altera `package.json` no repositório. Commits só de `.md`, `manual/**` ou `.gitignore` não publicam; mensagem começando com `[skip release]` também não. Cache do Electron/electron-builder no workflow.
- O app instalado (`electron/updater.js`, `electron-updater`, repositório público `Wfelipetm/gelo-frio`) procura versão nova **a cada 1 minuto** (silencioso) e ao focar a janela; baixa sozinho e mostra o selo NOVA + faixa "Reiniciar e atualizar" (instala em silêncio, `quitAndInstall(true,true)`). Só no app instalado (não em dev nem demo).
- Instalador NSIS (`build/installer.nsh`): perMachine em `C:\Program Files\FrioGest`; ao desinstalar pergunta se apaga os dados (padrão NÃO). Os dados da loja ficam em userData e nunca são tocados numa atualização.
- Pasta `Instalar-FrioGest/` (fora do git): instalador mais novo + Google Drive + manual + LEIA-ME. `npm run pacote` renova; `npm run baixar` baixa só o instalador; `npm run manual` regenera o manual (prints reais em Chrome com dados de exemplo).

## Regras de negócio importantes
- Login: scrypt, sessões em memória (12h), cookie httpOnly `sid`; requisições não-GET em `/api` exigem `X-Requested-With: friogest`. **"Manter conectado"** (caixa na tela de login, padrão marcada): cookie httpOnly `rm` de 30 dias; no banco (`remember_tokens`) fica só o hash do token — a senha nunca é guardada. Sair, desativar usuário e redefinir senha derrubam os tokens. O nome do usuário fica lembrado num cookie. Bloqueio após 5 senhas erradas por **usuário + IP**, com tempo dobrando (1, 2, 4… até 15 min).
- Usuário inicial `master` / `master123` com troca obrigatória (API responde 403 `{must_change:true}`). O master (id 1) não pode ser desativado nem rebaixado.
- Perfis: master, supervisor, vendedor, tecnico (`server/services.js`, PERMS/ROLE_PERMS). Custos escondidos de quem não tem `custo.ver`. **Valores da OS** (`os.valores`): o técnico não vê preços nem total da OS e não tem a lista de clientes (`cliente.ver`); ele vê Estoque e Gás para consulta e só as próprias OS.
- Gás: por cilindro; `produtos.estoque` de gás = soma de `cilindros.saldo_kg`. Venda/OS usa um cilindro que tenha tudo (loja primeiro, depois o menor suficiente) e, se nenhum tiver, **completa com vários** (`S.cilindrosParaGas`); devolução volta o kg aos cilindros de onde saiu (`S.devolverGas`). Na entrada por XML o gás é **reconhecido sozinho** (descrição com GAS/CIL + R410A/R22/R32…, peso do cilindro tirado do texto), vincula ao produto de gás do mesmo tipo ou cria um novo, e a quantidade da nota = nº de cilindros. Alerta: equipamento com 3+ cargas em 12 meses.
- OS = **folha de serviço**: campos de endereço do atendimento (rua, bairro, complemento, referência, contato e telefone), prioridade, instruções ao técnico. Impressão em `server/routes/print-os.js`: `/print/os/:id` (via do cliente, com valores) e `?via=tecnico` (sem preços, com espaços para preencher à mão). Estoque e gás só baixam ao **concluir**; "Concluir" já pode **faturar** (caixa marcada). Itens livres (mão de obra/deslocamento) aceitos. Fotos (várias de uma vez, reduzidas para JPEG) e assinatura em BLOB/dataURL; OS fechada não aceita foto.
- Financeiro: vendas, OS faturadas e entradas de NF geram lançamentos sozinhas. **Contas fixas** (`recorrencias`, aba "Contas fixas") lançam uma conta por mês (gerador roda ao abrir e a cada hora). Estorno de venda é lançado com `origem='estorno'` (etiqueta na tela). Painel lista contas vencidas e dos próximos 7 dias. Relatórios de vendedores e de lucro **incluem as OS faturadas**.
- Estoque: entrada manual já vem com "Lançar contas a pagar" marcada e uma parcela de 30 dias; produtos inativos aparecem no filtro "Inativos" (com "reativar"); custo do produto = **último custo** informado (sem custo médio, decisão pendente do dono).
- Backup (`server/backup.js`): local diário (30) + cópia externa opcional (pendrive/Drive; falha nunca derruba o backup local). `GET /api/backups/status` → `nivel` desligado|ok|falhou|atrasado (a faixa do topo avisa já na primeira falha; atrasado = sem cópia há 2+ dias). Faixa "só neste computador" tem **x** (escolha gravada em `backup_aviso_oculto`). **Restaurar** dentro do programa: `POST /api/backups/restaurar` valida o arquivo, guarda o estado atual num backup novo, troca o banco e o app reinicia.
- Dinheiro em REAL com `r2`, quantidades com `r3`. Números sequenciais na tabela `seq`. Tudo vai para `audit`.
- Impressora térmica: `server/escpos.js`, `server/printer.js` (spooler Windows RAW ou rede TCP 9100), `server/cupom.js`; a Bematech **MP-4200 TH** imprime 42 colunas (o sistema escolhe 42 sozinho quando o nome da impressora tem "MP-4200"). Cupom da OS segue a mesma regra de valores do perfil.
- Orçamento: PDF local + link `wa.me` (vendedor arrasta o PDF). Não há link público de aprovação; aprovação é manual. WhatsApp aparece como **ícone** nas telas.

## Comandos
`npm install` · `npm run dev` (servidor sem Electron, dados em dev-data/) · `npm start` (Electron) · `npm test` (API: `tests/smoke.js` 28 testes, `tests/printer.js` 21, `tests/backup.js` 12) · `npm run test:e2e` (UI no Chrome/Edge via CDP, banco temporário, 55 passos; `test:e2e:live` abre a janela; `test:e2e:passo` abre a janela e **pausa antes de cada passo** até existir o arquivo indicado) · `npm run seed` · `npm run dist` (instalador; precisa Windows ou Wine) · `npm run pacote` / `baixar` / `manual`.
Notas: better-sqlite3 traz binários prontos (inclui win32-x64), então `npmRebuild` está desligado.

## Documentos de acompanhamento
- `MELHORIAS.md`: lista viva de melhorias (o que foi feito e o que ainda depende de decisão).
- `RELATORIO-TESTES.md`: relatório dos testes passo a passo de 25/11/2026 (o que passou, achados e decisões do dono).

## Fora do escopo / pendente
- **NFC-e/NF-e não é emitida.** Em discussão: emitir via API (Focus NFe, NFE.io, PlugNotas…). Precisa de certificado A1, CSC, NCM/CFOP/CSOSN por produto e regime tributário do cliente.
- Perguntas abertas ao cliente: qual programa emite nota hoje, regime (MEI/Simples), certificado A1 ou A3, contato do contador.
- Instalador sem assinatura digital (o Windows avisa "protegeu o seu PC").
- Cartão (crédito/débito) entra no caixa na hora, sem taxa nem prazo — decidir com o dono.
- O PDF de proposta e o vídeo mostrados ao cliente ainda citam link de aprovação, acesso de qualquer lugar, backup em nuvem e NFC-e; precisam ser refeitos.
- Conferir o cupom novo na Bematech real (42 colunas, hora local).
