'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const A = require('../auth');
const { hashPassword, verifyPassword, loadExample } = require('../db');
const { can } = require('../services');

module.exports = (r, ctx) => {
  const { db, need, wrap, bad, S, opts } = ctx;
  const ROLES = ['master', 'supervisor', 'vendedor', 'tecnico'];

  const publicConfig = () => {
    const o = {};
    for (const { key, value } of db.prepare('SELECT key,value FROM settings').all()) o[key] = value;
    return o;
  };

  r.get('/info', wrap(() => ({ app: 'FrioGest', versao: opts.version || '1.0.0', demo: !!opts.demo, primeiro_acesso: !!db.prepare('SELECT must_change FROM users WHERE id=1').pluck().get() })));

  // ---------- sessão ----------
  r.post('/login', wrap((req, res) => {
    const out = A.login(db, req.body.username, req.body.password, req.body.lembrar === true);
    if (out.erro) throw bad(out.erro, 401);
    res.setHeader('Set-Cookie', out.remember ? [A.cookie(out.token), A.cookieRm(out.remember)] : A.cookie(out.token));
    S.log(out.user, 'login', null);
    return { user: A.publicUser(out.user) };
  }));
  r.post('/logout', wrap((req, res) => {
    if (req.sid) A.logout(req.sid, A.parseCookies(req).rm);
    res.setHeader('Set-Cookie', [A.cookie('', 0), A.cookieRm('', 0)]);
    return { ok: true };
  }));
  r.get('/me', need(null, { allowMust: true }), wrap(req => ({ user: A.publicUser(req.user), config: publicConfig() })));
  r.post('/me/senha', need(null, { allowMust: true }), wrap(req => {
    const { atual, nova } = req.body;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!verifyPassword(atual, u.pass_salt, u.pass_hash)) throw bad('Senha atual incorreta');
    if (String(nova || '').length < 6) throw bad('A nova senha precisa ter pelo menos 6 caracteres');
    if (nova === atual) throw bad('A nova senha precisa ser diferente da atual');
    const { salt, hash } = hashPassword(nova);
    db.prepare('UPDATE users SET pass_hash=?, pass_salt=?, must_change=0 WHERE id=?').run(hash, salt, u.id);
    S.log(req.user, 'senha.trocar', null);
    return { ok: true };
  }));

  // ---------- usuários (somente master) ----------
  const userRow = u => ({ id: u.id, username: u.username, nome: u.nome, role: u.role, ativo: !!u.ativo, comissao_pct: u.comissao_pct, telefone: u.telefone, must_change: !!u.must_change, created_at: u.created_at });
  r.get('/usuarios', need('usuarios'), wrap(() => db.prepare('SELECT * FROM users ORDER BY ativo DESC, nome').all().map(userRow)));
  // lista simples (id, nome, perfil) para selecionar técnico/vendedor
  r.get('/equipe', need(null), wrap(() => db.prepare('SELECT id,nome,role FROM users WHERE ativo=1 ORDER BY nome').all()));

  r.post('/usuarios', need('usuarios'), wrap(req => {
    const { username, nome, role, senha, comissao_pct = 0, telefone = '' } = req.body;
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(String(username || ''))) throw bad('Usuário: 3 a 30 letras/números (sem espaços)');
    if (!String(nome || '').trim()) throw bad('Informe o nome');
    if (!ROLES.includes(role)) throw bad('Perfil inválido');
    if (String(senha || '').length < 6) throw bad('A senha precisa ter pelo menos 6 caracteres');
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw bad('Já existe um usuário com esse login');
    const { salt, hash } = hashPassword(senha);
    const id = db.prepare(`INSERT INTO users(username,nome,role,pass_hash,pass_salt,must_change,comissao_pct,telefone) VALUES(?,?,?,?,?,1,?,?)`)
      .run(username.trim(), nome.trim(), role, hash, salt, Number(comissao_pct) || 0, telefone).lastInsertRowid;
    S.log(req.user, 'usuario.criar', `${username} (${role})`);
    return { id };
  }));

  r.put('/usuarios/:id', need('usuarios'), wrap(req => {
    const id = +req.params.id;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) throw bad('Usuário não encontrado', 404);
    const b = req.body;
    const role = b.role ?? u.role;
    const ativo = b.ativo === undefined ? u.ativo : (b.ativo ? 1 : 0);
    if (!ROLES.includes(role)) throw bad('Perfil inválido');
    if (id === 1 && (role !== 'master' || !ativo)) throw bad('O usuário master principal não pode ser desativado nem mudar de perfil');
    if ((u.role === 'master' && u.ativo) && (role !== 'master' || !ativo)) {
      const outros = db.prepare("SELECT COUNT(*) FROM users WHERE role='master' AND ativo=1 AND id<>?").pluck().get(id);
      if (!outros) throw bad('Precisa existir pelo menos um master ativo');
    }
    if (id === req.user.id && !ativo) throw bad('Você não pode desativar o próprio usuário');
    db.prepare('UPDATE users SET nome=?, role=?, ativo=?, comissao_pct=?, telefone=? WHERE id=?')
      .run(String(b.nome ?? u.nome).trim() || u.nome, role, ativo, b.comissao_pct === undefined ? u.comissao_pct : Number(b.comissao_pct) || 0, b.telefone ?? u.telefone, id);
    if (!ativo || role !== u.role) A.dropUserSessions(id);
    S.log(req.user, 'usuario.editar', `${u.username}: perfil=${role} ativo=${ativo}`);
    return { ok: true };
  }));

  r.post('/usuarios/:id/senha', need('usuarios'), wrap(req => {
    const id = +req.params.id;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) throw bad('Usuário não encontrado', 404);
    if (String(req.body.senha || '').length < 6) throw bad('A senha precisa ter pelo menos 6 caracteres');
    const { salt, hash } = hashPassword(req.body.senha);
    db.prepare('UPDATE users SET pass_hash=?, pass_salt=?, must_change=? WHERE id=?').run(hash, salt, id === req.user.id ? 0 : 1, id);
    A.dropUserSessions(id);
    S.log(req.user, 'usuario.senha', u.username);
    return { ok: true };
  }));

  // ---------- configurações ----------
  r.get('/config', need(null), wrap(() => publicConfig()));
  r.put('/config', need('config'), wrap(req => {
    const allowed = ['loja_nome', 'loja_doc', 'loja_telefone', 'loja_endereco', 'loja_logo', 'margem_padrao', 'validade_dias', 'manut_meses', 'estoque_negativo', 'msg_orcamento', 'msg_manutencao',
      'impressora_modo', 'impressora_nome', 'impressora_ip', 'impressora_porta', 'impressora_colunas', 'impressora_codepage', 'impressora_corte', 'impressora_gaveta', 'impressora_auto', 'cupom_rodape'];
    const up = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    db.transaction(() => { for (const k of allowed) if (k in req.body) up.run(k, String(req.body[k] ?? '')); })();
    S.log(req.user, 'config.salvar', Object.keys(req.body).join(','));
    return publicConfig();
  }));
  r.post('/config/exemplo', need('config'), wrap(req => {
    const ok = loadExample(db);
    if (!ok) throw bad('Já existem produtos cadastrados. Os dados de exemplo só podem ser carregados com o cadastro vazio.');
    S.log(req.user, 'config.exemplo', null);
    return { ok: true };
  }));

  // ---------- rede local ----------
  const lanUrls = port => {
    const out = [];
    for (const list of Object.values(os.networkInterfaces()))
      for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
    return out;
  };
  r.get('/rede', need('config'), wrap(() => {
    const cfg = opts.readNet();
    return { lan: !!cfg.lan, port: cfg.port, portaEmUso: ctx.state.port, ouvindoNaRede: ctx.state.host === '0.0.0.0', urls: lanUrls(ctx.state.port), dataDir: opts.dataDir, backupDir: opts.backupDir };
  }));
  r.put('/rede', need('config'), wrap(req => {
    const lan = !!req.body.lan;
    const port = Math.min(65000, Math.max(1024, parseInt(req.body.port, 10) || 3210));
    opts.writeNet({ lan, port });
    S.log(req.user, 'rede.salvar', `lan=${lan} porta=${port}`);
    return { ok: true, reiniciar: true };
  }));

  // ---------- backup ----------
  const BK = /^friogest_\d{4}-\d{2}-\d{2}_\d{6}(_auto)?\.db$/;
  const listBackups = () => !fs.existsSync(opts.backupDir) ? [] :
    fs.readdirSync(opts.backupDir).filter(f => BK.test(f)).map(f => { const st = fs.statSync(path.join(opts.backupDir, f)); return { nome: f, tamanho: st.size, data: st.mtime.toISOString() }; })
      .sort((a, b) => b.nome.localeCompare(a.nome));
  r.get('/backups', need('backup'), wrap(() => ({ pasta: opts.backupDir, arquivos: listBackups(), externo: ctx.backup.status() })));
  r.get('/backups/status', need('backup'), wrap(() => ctx.backup.status()));
  // "só quero backup local": esconde a faixa de aviso (volta se a cópia externa for configurada e depois desligada)
  r.post('/backups/ocultar-aviso', need('backup'), wrap(req => { S.log(req.user, 'backup.aviso_oculto', ''); return ctx.backup.ocultarAviso(); }));
  r.post('/backups', need('backup'), wrap(req => {
    const { arquivo, externo } = ctx.backup.criar(false);
    S.log(req.user, 'backup.criar', arquivo + (externo.ok ? ' (+ cópia externa)' : ''));
    return { arquivo, externo, status: ctx.backup.status() };
  }));
  // pasta da cópia externa (pendrive / Drive sincronizado); texto vazio desliga
  r.put('/backups/externo', need('backup'), wrap(req => {
    const out = ctx.backup.definirPasta(req.body.pasta);
    S.log(req.user, 'backup.externo', out.status.pasta || 'desligado');
    return out;
  }));
  r.get('/backups/:nome', need('backup'), (req, res) => {
    if (!BK.test(req.params.nome)) return res.status(400).json({ erro: 'Arquivo inválido' });
    const f = path.join(opts.backupDir, req.params.nome);
    if (!fs.existsSync(f)) return res.status(404).json({ erro: 'Arquivo não encontrado' });
    res.download(f);
  });

  r.get('/auditoria', need('auditoria'), wrap(req => {
    if (req.query.pagina === undefined) return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(Math.min(+req.query.limit || 200, 1000));
    // paginado: ?pagina=1&por=50 -> { itens, total, pagina, paginas, por }
    const por = Math.min(Math.max(parseInt(req.query.por, 10) || 50, 10), 200);
    const total = db.prepare('SELECT COUNT(*) FROM audit').pluck().get();
    const paginas = Math.max(1, Math.ceil(total / por));
    const pagina = Math.min(Math.max(parseInt(req.query.pagina, 10) || 1, 1), paginas);
    const itens = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?').all(por, (pagina - 1) * por);
    return { itens, total, pagina, paginas, por };
  }));
};
