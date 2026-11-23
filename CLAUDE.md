# FrioGest — contexto do projeto (para continuar no VS Code / Claude Code)

Dono: Aleijado (dev, freelance). Cliente: loja de refrigeração (ar-condicionado). Sistema 100% local (Windows), sem internet obrigatória.
Idioma da UI e das respostas: **português do Brasil**.

## O que é
PDV/vendas, orçamentos, estoque (entrada manual e por XML de NF-e de compra), gás refrigerante por cilindro (kg), ordens de serviço (OS), financeiro (a receber/pagar, caixa), relatórios, usuários com perfis, auditoria, backup.

## Arquitetura
- Electron (`electron/main.js`) sobe um servidor Express embutido em 127.0.0.1:3210 (próxima porta livre se ocupada) e abre uma janela apontando para ele. `preload.js` expõe `window.friogest` {savePdf, openExternal, restart}.
- Modo rede opcional (0.0.0.0) ligado em Configurações; grava `config.json` {lan, port}; exige reiniciar.
- Banco: SQLite (better-sqlite3, WAL). Esquema em `server/db.js` com `PRAGMA user_version`. Banco vivo em userData; backups em Documentos/FrioGest/Backups (`VACUUM INTO`, diário, mantém 30). PDFs em Documentos/FrioGest/PDFs.
- Frontend: JS vanilla com ES modules, rota por hash `#/rota`, `innerHTML` com `esc()`. Uma tela por arquivo em `public/js/views/`. Helpers em `public/js/core.js`.
- Visual: tema "profissional" em `public/css/app.css` (tokens em `:root`, fonte Inter embutida em `public/fonts/` — funciona offline; números tabulares). Menu escuro, cards com sombra leve, login em 2 colunas.
- **Modo demonstração** (para mandar ao cliente): `npm run demo` (navegador) ou `npm run dist:demo` → `dist-demo/FrioGest-Demo-<versão>.exe` (portátil, duplo clique). Banco temporário + dados de exemplo (`scripts/seed.js`), login automático, faixa laranja "MODO DEMONSTRAÇÃO", apaga tudo ao fechar. Liga por `FRIOGEST_DEMO=1` ou arquivo `electron/demo.flag` (criado só durante o build). `server/demo.js` prepara o master (`demo-friogest`). Não toca em dados reais.
- Ícones: Lucide embutido (offline). `public/js/icons.js` é GERADO por `node scripts/gen-icons.js` a partir do `lucide-static` (devDependency); para usar um ícone novo, adicione o nome em `NAMES` no script, rode-o e use `icon('nome', tamanho)` (exportado por `core.js`). Nada de emoji na UI.
- Backup externo: `server/backup.js`. Além do backup local (diário, 30), copia cada backup para uma pasta escolhida em Backup > "Cópia externa" (pendrive, HD externo ou pasta sincronizada do Google Drive; guarda 30; grava em `.parcial` e renomeia). Falha na cópia nunca derruba o backup local: grava `backup_externo_erro` e tenta de novo a cada hora. `GET /api/backups/status` → `nivel` desligado|ok|atrasado (atrasado = sem cópia há mais de 2 dias); a faixa amarela/vermelha no topo (`#bk-bar`, `main.js`) usa isso. Recusa pasta igual à de backups ou dentro da pasta do banco. Settings `backup_externo_pasta/ultimo/erro`. Restauração ainda é manual (ver tela de Backup).
- Impressora térmica: `server/escpos.js` (comandos ESC/POS e interpretador), `server/printer.js` (spooler Windows RAW, rede TCP 9100), `server/cupom.js` (layout dos cupons), rotas em `server/routes/impressao.js`; modo "comum" imprime a página `/print/cupom/...` (80 mm). Configuração em Configurações > Impressora térmica. Testado só com impressora falsa (`tests/printer.js`); falta testar na Bematech MP-4200 TH real.
- PDF: páginas HTML A4 em `server/routes/print.js` (`/print/orcamento|venda|etiqueta|os/:id`); no Electron `printToPDF` numa janela oculta (IPC `savePdf`).

## Regras de negócio importantes
- Login: scrypt, sessões em memória (12h), cookie httpOnly `sid`; requisições não-GET em `/api` exigem header `X-Requested-With: friogest`; bloqueio após 5 falhas.
- Usuário inicial `master` / `master123` com troca de senha obrigatória (API responde 403 `{must_change:true}` até trocar). O master (id 1) não pode ser desativado nem rebaixado; sempre deve existir um master ativo.
- Perfis: master, supervisor, vendedor, tecnico. Permissões em `server/services.js` (PERMS/ROLE_PERMS). Custos escondidos de quem não tem `custo.ver`.
- Gás: controlado por cilindro; `produtos.estoque` de gás = soma de `cilindros.saldo_kg`. Venda/OS escolhe cilindro automaticamente (prioriza o da loja, depois o menor suficiente). Entrada de NF de gás cria N cilindros. Alerta: equipamento com 3+ cargas em 12 meses.
- OS: estoque e gás só baixam ao **concluir**; "faturar" gera o lançamento financeiro. Fotos em BLOB, assinatura em dataURL.
- Dinheiro em REAL com `r2`, quantidades com `r3`. Números sequenciais na tabela `seq`. Tudo vai para `audit`.
- Orçamento: PDF local + link `wa.me` do WhatsApp (vendedor arrasta o PDF). **Não há** link público de aprovação nem aviso de "cliente viu"; aprovação é manual.

## Comandos
`npm install` · `npm run dev` (servidor sem Electron, dados em dev-data/) · `npm start` (Electron) · `npm test` (23 testes de API em tests/smoke.js) · `npm run test:e2e` (UI no Chrome/Edge via CDP, banco temporário; `test:e2e:live` abre a janela) · `npm run seed` (dados de teste via API num sistema em execução; precisa `SEED_PASS`) · `npm run dist` (instalador NSIS; precisa Windows ou Wine) · `build-windows.bat` · workflow `.github/workflows/build-windows.yml`.
Notas: better-sqlite3 traz binários prontos (inclui win32-x64), então `npmRebuild` está desligado. No Linux sem Wine o `electron-builder` não fecha o instalador; a pasta `dist/win-unpacked` serve como versão portátil.

## Fora do escopo / pendente
- **NFC-e/NF-e não é emitida.** Em discussão: emitir via API (Focus NFe, NFE.io, PlugNotas…) e imprimir em impressora térmica 80 mm. Precisa de certificado A1, CSC, NCM/CFOP/CSOSN por produto e regime tributário do cliente.
- Perguntas abertas ao cliente: qual programa emite nota hoje, regime (MEI/Simples), certificado A1 ou A3, modelo da impressora térmica (80/58 mm, USB/rede), contato do contador.
- Próximo passo sugerido: impressão térmica (recibo não fiscal ESC/POS ou `webContents.print` silencioso), depois NFC-e via API escolhida.
- O PDF de proposta e o vídeo mostrados ao cliente ainda citam link de aprovação, acesso de qualquer lugar, backup em nuvem e NFC-e; precisam ser refeitos.
- Não testado em Windows real (só Electron em Linux com xvfb e navegador).
