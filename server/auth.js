'use strict';
const crypto = require('crypto');
const { verifyPassword } = require('./db');
const { can, ROLE_PERMS } = require('./services');

const sessions = new Map(); // token -> { uid, exp }
const TTL = 12 * 3600 * 1000;
const attempts = new Map(); // username -> { n, until }

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionMiddleware(db) {
  return (req, res, next) => {
    const sid = parseCookies(req).sid;
    const s = sid && sessions.get(sid);
    if (s && s.exp > Date.now()) {
      const u = db.prepare('SELECT id,username,nome,role,ativo,must_change,comissao_pct FROM users WHERE id=?').get(s.uid);
      if (u && u.ativo) { s.exp = Date.now() + TTL; req.user = u; req.sid = sid; }
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

function login(db, username, password) {
  const key = String(username || '').toLowerCase();
  const a = attempts.get(key);
  if (a && a.until > Date.now()) return { erro: 'Muitas tentativas. Aguarde 1 minuto.' };
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').trim());
  if (!u || !u.ativo || !verifyPassword(password, u.pass_salt, u.pass_hash)) {
    const n = (a?.n || 0) + 1;
    attempts.set(key, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
    if (n >= 5) attempts.set(key, { n: 0, until: Date.now() + 60000 });
    return { erro: 'Usuário ou senha incorretos' };
  }
  attempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { uid: u.id, exp: Date.now() + TTL });
  return { token, user: u };
}

function dropUserSessions(uid) { for (const [t, s] of sessions) if (s.uid === uid) sessions.delete(t); }
function logout(sid) { sessions.delete(sid); }
const cookie = (token, maxAge = TTL / 1000) => `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

function publicUser(u) {
  return { id: u.id, username: u.username, nome: u.nome, role: u.role, must_change: !!u.must_change, perms: ROLE_PERMS[u.role] || [] };
}

module.exports = { sessionMiddleware, need, login, logout, dropUserSessions, cookie, publicUser };
