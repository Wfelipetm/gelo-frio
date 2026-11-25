'use strict';
const crypto = require('crypto');
const { verifyPassword } = require('./db');
const { can, ROLE_PERMS } = require('./services');

const sessions = new Map(); // token -> { uid, exp }
const TTL = 12 * 3600 * 1000;
const attempts = new Map(); // username -> { n, until }

// "Manter conectado": token de 30 dias num cookie httpOnly (`rm`). No banco fica só o HASH do token (nunca a senha).
const REMEMBER_MS = 30 * 24 * 3600 * 1000;
let DB = null;
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function prepararRemember(db) {
  DB = db;
  db.exec('CREATE TABLE IF NOT EXISTS remember_tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, exp INTEGER NOT NULL)');
  db.prepare('DELETE FROM remember_tokens WHERE exp<?').run(Date.now());
}
function criarRemember(uid) {
  const t = crypto.randomBytes(32).toString('hex');
  DB.prepare('INSERT INTO remember_tokens(hash,user_id,exp) VALUES(?,?,?)').run(sha(t), uid, Date.now() + REMEMBER_MS);
  return t;
}
const cookieRm = (token, maxAge = REMEMBER_MS / 1000) => `rm=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionMiddleware(db) {
  prepararRemember(db);
  const USER = 'SELECT id,username,nome,role,ativo,must_change,comissao_pct FROM users WHERE id=?';
  return (req, res, next) => {
    const ck = parseCookies(req);
    const sid = ck.sid;
    const s = sid && sessions.get(sid);
    if (s && s.exp > Date.now()) {
      const u = db.prepare(USER).get(s.uid);
      if (u && u.ativo) { s.exp = Date.now() + TTL; req.user = u; req.sid = sid; }
    }
    // sem sessão (programa foi fechado/reiniciado) mas com "manter conectado": entra de novo sem pedir a senha
    if (!req.user && ck.rm) {
      const r = db.prepare('SELECT user_id FROM remember_tokens WHERE hash=? AND exp>?').get(sha(ck.rm), Date.now());
      const u = r && db.prepare(USER).get(r.user_id);
      if (u && u.ativo) {
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, { uid: u.id, exp: Date.now() + TTL });
        res.append('Set-Cookie', cookie(token));
        req.user = u; req.sid = token;
      }
    }
    next();
  };
}

function need(perm, { allowMust = false } = {}) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ erro: 'Faça login para continuar' });
    if (req.user.must_change && !allowMust) return res.status(403).json({ erro: 'Troque a senha para continuar', must_change: true });
    if (perm && !can(req.user.role, perm)) return res.status(403).json({ erro: 'Você não tem permissão para isso' });
    next();
  };
}

// Bloqueio por usuário E origem (IP): quem erra a senha a partir de um computador não trava o mesmo usuário em outro.
// A cada bloqueio o tempo dobra (1, 2, 4… até 15 minutos).
function login(db, username, password, lembrar = false, ip = '') {
  const key = String(ip || '') + '|' + String(username || '').toLowerCase();
  const a = attempts.get(key);
  if (a && a.until > Date.now()) { const min = Math.max(1, Math.ceil((a.until - Date.now()) / 60000)); return { erro: `Muitas tentativas. Aguarde ${min} minuto${min > 1 ? 's' : ''}.` }; }
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').trim());
  if (!u || !u.ativo || !verifyPassword(password, u.pass_salt, u.pass_hash)) {
    const n = (a?.n || 0) + 1; const nivel = a?.nivel || 0;
    if (n >= 5) attempts.set(key, { n: 0, nivel: nivel + 1, until: Date.now() + Math.min(15, 2 ** nivel) * 60000 });
    else attempts.set(key, { n, nivel, until: 0 });
    return { erro: 'Usuário ou senha incorretos' };
  }
  attempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { uid: u.id, exp: Date.now() + TTL });
  return { token, user: u, remember: lembrar ? criarRemember(u.id) : null };
}

function dropUserSessions(uid) { for (const [t, s] of sessions) if (s.uid === uid) sessions.delete(t); if (DB) DB.prepare('DELETE FROM remember_tokens WHERE user_id=?').run(uid); }
function logout(sid, rm) { sessions.delete(sid); if (DB && rm) DB.prepare('DELETE FROM remember_tokens WHERE hash=?').run(sha(rm)); }
const cookie = (token, maxAge = TTL / 1000) => `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

function publicUser(u) {
  return { id: u.id, username: u.username, nome: u.nome, role: u.role, must_change: !!u.must_change, perms: ROLE_PERMS[u.role] || [] };
}

module.exports = { sessionMiddleware, need, login, logout, dropUserSessions, cookie, cookieRm, parseCookies, publicUser };
