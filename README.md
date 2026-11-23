# FrioGest — sistema para loja de refrigeração (100% local)

Vendas/PDV, orçamentos, estoque (entrada por XML da NF-e), gás refrigerante por cilindro, ordens de serviço, financeiro e relatórios. Funciona **sem internet**; os dados ficam no computador da loja.

## Instalar / usar
- **Instalador:** rode `build-windows.bat` num Windows com Node.js 22 (gera `dist\FrioGest Setup x.y.z.exe`), ou rode o workflow *Gerar instalador Windows* no GitHub (Actions).
- **Versão portátil:** descompacte `FrioGest-portatil-win64.zip` e abra `FrioGest.exe`.
- **Desenvolvimento:** `npm install`, `npm start` (Electron), `npm run dev` (só servidor, http://127.0.0.1:3210), `npm test`.

## Primeiro acesso
Usuário **master** / senha **master123**. O sistema obriga a trocar a senha no primeiro login. O master acessa tudo e cria os demais usuários em *Usuários*.

## Perfis
| Perfil | Acesso |
|---|---|
| Master | Tudo, inclusive usuários, configurações, backup e auditoria |
| Supervisor | Operação completa, custos, cancelamentos, financeiro e relatórios |
| Vendedor | PDV, orçamentos, clientes, consulta de estoque (sem custos) |
| Técnico | Apenas as próprias OS (sem custos) |

## Dados e backup
- Banco: pasta de dados do app (`%APPDATA%\FrioGest`), arquivo `friogest.db`.
- Backup automático diário (mantém 30) em `Documentos\FrioGest\Backups`. Também há o botão em *Backup*. Copie essa pasta para pendrive/nuvem.
- **Restaurar:** feche o app, copie o backup para a pasta do banco, renomeie para `friogest.db` (apague `friogest.db-wal`/`-shm`) e abra o app.
- PDFs ficam em `Documentos\FrioGest\PDFs`.

## Rede local (celular / outro PC)
*Configurações → Acesso pela rede*: ativa e reinicia. Acesse pelo endereço mostrado (ex.: `http://192.168.0.10:3210`) e libere o Firewall do Windows.

## Orçamento por WhatsApp
O PDF é gerado localmente e o WhatsApp abre na conversa do cliente com a mensagem pronta; arraste o PDF para a conversa. Não há link público nem aviso de "cliente viu"; a aprovação é manual (botão Aprovar).

## Limitações
- **Não emite NF-e/NFC-e** (exige internet, certificado e um serviço como Focus NFe ou NFE.io). A entrada de mercadoria por XML de compra funciona.
- Instalador sem assinatura digital: o Windows pode mostrar o aviso do SmartScreen (Mais informações → Executar assim mesmo).
