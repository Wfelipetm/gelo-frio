'use strict';
// Backup do banco: cópia local (VACUUM INTO, mantém 30) + cópia externa opcional.
// A cópia externa vai para uma pasta escolhida pelo cliente (pendrive, HD externo ou pasta sincronizada
// do Google Drive / OneDrive). Se ela estiver indisponível, o backup local continua e a falha fica registrada.
const fs = require('fs');
const path = require('path');
const { bad } = require('./services');

const pad = n => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const BK = /^friogest_\d{4}-\d{2}-\d{2}_\d{6}(_auto)?\.db$/;
const MANTER = 30;            // quantos arquivos guardar em cada pasta
const LIMITE_DIAS = 2;        // sem cópia externa há mais que isso => alerta vermelho

module.exports = (db, opts) => {
  const get = k => db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(k) ?? '';
  const set = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v ?? ''));
  const norm = p => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();

  const locais = () => (fs.existsSync(opts.backupDir) ? fs.readdirSync(opts.backupDir) : []).filter(f => BK.test(f)).sort();
  const podar = dir => {
    const todos = fs.readdirSync(dir).filter(f => BK.test(f)).sort();
    for (const f of todos.slice(0, Math.max(0, todos.length - MANTER))) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignora */ } }
  };
  const pasta = () => get('backup_externo_pasta').trim();

  const msgErro = e => {
    const c = e && e.code;
    if (c === 'ENOENT') return 'A pasta ou a unidade não foi encontrada (pendrive desconectado ou Drive fechado?)';
    if (c === 'EACCES' || c === 'EPERM') return 'Sem permissão para gravar nessa pasta';
    if (c === 'ENOSPC') return 'Sem espaço livre no destino';
    if (c === 'ENOTDIR' || c === 'EEXIST') return 'O caminho informado não é uma pasta (já existe um arquivo com esse nome)';
    if (c === 'EBUSY' || c === 'EMFILE') return 'O destino está em uso por outro programa. Tente de novo em instantes';
    if (c === 'EROFS') return 'O destino é somente leitura (pendrive protegido contra gravação?)';
    if (c === 'ENAMETOOLONG' || c === 'EINVAL') return 'O nome ou o caminho da pasta é inválido';
    return String((e && e.message) || e);
  };

  /** Copia um backup local para a pasta externa. Nunca lança: devolve { ok, erro }. */
  function copiarExterno(nome) {
    const dir = pasta();
    if (!dir) return { ok: false, desligado: true };
    try {
      if (!fs.existsSync(path.parse(path.resolve(dir)).root)) throw Object.assign(new Error('raiz ausente'), { code: 'ENOENT' });
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, nome), tmp = dest + '.parcial';
      fs.copyFileSync(path.join(opts.backupDir, nome), tmp);
      fs.renameSync(tmp, dest);               // só aparece completo (o Drive não sincroniza arquivo pela metade)
      podar(dir);
      set('backup_externo_ultimo', new Date().toISOString());
      set('backup_externo_erro', '');
      return { ok: true };
    } catch (e) {
      const erro = msgErro(e);
      set('backup_externo_erro', erro);
      return { ok: false, erro };
    }
  }

  /** Cria o backup local e, se configurado, a cópia externa. */
  function criar(auto) {
    // o nome tem segundos; se já existir (dois backups no mesmo segundo), avança 1 s até achar um nome livre
    let d = new Date(), nome;
    do { nome = `friogest_${stamp(d)}${auto ? '_auto' : ''}.db`; d = new Date(d.getTime() + 1000); } while (fs.existsSync(path.join(opts.backupDir, nome)));
    db.exec(`VACUUM INTO '${path.join(opts.backupDir, nome).replace(/'/g, "''")}'`);
    const todos = locais();
    for (const f of todos.slice(0, Math.max(0, todos.length - MANTER))) { try { fs.unlinkSync(path.join(opts.backupDir, f)); } catch { /* ignora */ } }
    return { arquivo: nome, externo: copiarExterno(nome) };
  }

  /** Garante o backup do dia e repete a cópia externa se ela ficou pendente (ex.: pendrive estava fora). */
  function rotina() {
    const hoje = stamp().slice(0, 10);
    try { if (!locais().some(f => f.startsWith(`friogest_${hoje}`))) criar(true); }
    catch (e) { console.error('Backup automático falhou:', e.message); }
    sincronizar();
  }
  function sincronizar() {
    const dir = pasta(), ult = locais().pop();
    if (!dir || !ult) return;
    if (!fs.existsSync(path.join(dir, ult))) copiarExterno(ult);
  }

  /** Estado para a tela e para o alerta. nivel: desligado | ok | atrasado */
  function status() {
    const dir = pasta(), ultimo = get('backup_externo_ultimo'), erro = get('backup_externo_erro');
    const idadeMs = ultimo ? Date.now() - new Date(ultimo).getTime() : null;
    const dias = idadeMs == null ? null : Math.floor(idadeMs / 86400000);
    let nivel = 'ok';
    if (!dir) nivel = 'desligado';
    else if (idadeMs == null || idadeMs > LIMITE_DIAS * 86400000) nivel = 'atrasado';
    else if (erro) nivel = 'falhou';           // a última tentativa falhou (ainda há cópia recente): avisa já, sem esperar 2 dias
    return { nivel, pasta: dir, ultimo: ultimo || null, dias, erro, limite_dias: LIMITE_DIAS, aviso_oculto: get('backup_aviso_oculto') === '1' };
  }
  /** O usuário quer usar só o backup local: esconde a faixa "só neste computador". */
  const ocultarAviso = () => { set('backup_aviso_oculto', '1'); return status(); };

  /** Define (ou, com texto vazio, desliga) a pasta externa. Testa gravação antes de aceitar. */
  function definirPasta(p) {
    p = String(p || '').trim().replace(/^"(.*)"$/, '$1');
    if (!p) { set('backup_externo_pasta', ''); set('backup_externo_erro', ''); return { status: status(), copia: null }; }
    if (!path.isAbsolute(p)) throw bad('Informe o caminho completo da pasta, por exemplo G:\\Meu Drive\\FrioGest');
    const alvo = norm(p);
    if (alvo === norm(opts.backupDir)) throw bad('Essa é a própria pasta de backups do sistema. Escolha outra, de preferência em outro disco, pendrive ou no Drive.');
    if (alvo === norm(opts.dataDir) || alvo.startsWith(norm(opts.dataDir) + path.sep)) throw bad('Essa pasta fica junto do banco de dados e não protege contra defeito no computador. Escolha outro lugar.');
    try {
      if (!fs.existsSync(path.parse(path.resolve(p)).root)) throw Object.assign(new Error('raiz ausente'), { code: 'ENOENT' });
      fs.mkdirSync(p, { recursive: true });
      const t = path.join(p, `.friogest-teste-${process.pid}`);
      fs.writeFileSync(t, 'ok'); fs.unlinkSync(t);
    } catch (e) { throw bad('Não consegui gravar nessa pasta: ' + msgErro(e)); }
    set('backup_externo_pasta', p); set('backup_aviso_oculto', ''); // configurou: se desligar depois, o aviso volta
    set('backup_externo_ultimo', ''); set('backup_externo_erro', '');
    const copia = criar(false);          // já faz a primeira cópia para a pasta nova
    return { status: status(), copia };
  }

  /** Restaura um backup local: valida o arquivo, guarda o estado atual num backup novo e troca o banco.
   *  Depois disso o banco fica fechado: o programa precisa reiniciar. */
  function restaurar(nome, { aviso } = {}) {
    if (!BK.test(String(nome || ''))) throw bad('Backup inválido');
    const origem = path.join(opts.backupDir, nome);
    if (!fs.existsSync(origem)) throw bad('Backup não encontrado', 404);
    const Database = require('better-sqlite3');
    let t;
    try {
      t = new Database(origem, { readonly: true, fileMustExist: true });
      if (t.pragma('integrity_check', { simple: true }) !== 'ok') throw bad('O arquivo de backup está danificado e não pode ser restaurado');
      t.prepare('SELECT COUNT(*) FROM users').pluck().get(); t.prepare('SELECT COUNT(*) FROM produtos').pluck().get();
    } catch (e) { throw e && e.status ? e : bad('Este arquivo não parece um backup do FrioGest'); } finally { try { t && t.close(); } catch { /* ignora */ } }
    const seguranca = criar(false).arquivo;       // o estado de agora fica guardado, caso o dono se arrependa
    if (aviso) aviso(seguranca);                   // registra na auditoria ANTES de fechar o banco
    const dest = path.join(opts.dataDir, 'friogest.db');
    db.close();
    for (const ext of ['-wal', '-shm']) { try { fs.rmSync(dest + ext, { force: true }); } catch { /* ignora */ } }
    fs.copyFileSync(origem, dest);
    return { ok: true, seguranca, restaurado: nome };
  }

  return { criar, rotina, status, definirPasta, ocultarAviso, restaurar, locais, BK };
};
module.exports.BK = BK;
