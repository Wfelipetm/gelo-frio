'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const { open } = require('./db');
const A = require('./auth');
const { HttpError, bad, makeServices } = require('./services');

const pad = n => String(n).padStart(2, '0');
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };

/**
 * Cria o servidor local do FrioGest.
 * opts: { dataDir, backupDir, version, publicDir, readNet(), writeNet(cfg) }
 */
function createServer(opts) {
  const { db, file } = open(opts.dataDir);
  fs.mkdirSync(opts.backupDir, { recursive: true });
  const S = makeServices(db);
  const state = { port: null, host: null };

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12mb' }));
  app.use(A.sessionMiddleware(db));
  // proteção simples contra requisições forjadas de outros sites
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-requested-with') !== 'friogest') return res.status(403).json({ erro: 'Requisição inválida' });
    next();
  });

  const wrap = fn => (req, res, next) => {
    try { const out = fn(req, res); if (out !== undefined && !res.headersSent) res.json(out); }
    catch (e) { next(e); }
  };

  // Backup consistente do banco (VACUUM INTO, mantém os últimos 30) + cópia externa opcional (server/backup.js)
  const backup = require('./backup')(db, opts);
  const makeBackup = auto => backup.criar(auto).arquivo;
  const backupDoDia = backup.rotina;

  const ctx = { db, S, opts, state, wrap, bad, need: A.need, makeBackup, backup };
  const api = express.Router();
  for (const m of ['core', 'cadastros', 'estoque', 'os', 'vendas', 'financeiro', 'impressao']) require(`./routes/${m}`)(api, ctx);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ erro: 'Recurso não encontrado' }));

  const pr = express.Router();
  require('./routes/print')(pr, ctx);
  app.use('/print', pr);

  app.use(express.static(opts.publicDir, { etag: true, maxAge: 0 }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ erro: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo muito grande' });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ erro: 'Dados inválidos' });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno: ' + (err.message || err) });
  });

  // Sobe o servidor tentando as próximas portas se a escolhida estiver ocupada (ou reservada)
  const listen = (port, host) => new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = p => {
      const server = app.listen(p, host);
      server.once('listening', () => {
        state.port = p; state.host = host;
        backupDoDia();
        const t = setInterval(backupDoDia, 3600 * 1000); t.unref();
        resolve({ server, port: p, host });
      });
      server.once('error', e => {
        // porta ocupada (EADDRINUSE) ou reservada pelo Windows (EACCES: Hyper-V, Docker, WSL): tenta a próxima.
        // As faixas reservadas costumam ter ~50 portas, por isso o limite é folgado.
        if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && tries++ < 120) attempt(p + 1); else reject(e);
      });
    };
    attempt(port);
  });

  const close = () => { try { db.close(); } catch { /* ignora */ } };
  return { app, db, file, listen, close, makeBackup };
}

module.exports = { createServer };
