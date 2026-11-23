'use strict';
// Modo desenvolvimento / servidor puro (sem Electron): node server/dev.js
const path = require('path');
const fs = require('fs');
const { createServer } = require('./index');
const dataDir = process.env.FRIOGEST_DATA || path.join(__dirname, '..', 'dev-data');
const cfgFile = path.join(dataDir, 'config.json');
const readNet = () => { try { return { lan: false, port: 3210, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch { return { lan: false, port: 3210 }; } };
const writeNet = c => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(c)); };
const srv = createServer({ dataDir, backupDir: path.join(dataDir, 'backups'), version: 'dev', publicDir: path.join(__dirname, '..', 'public'), readNet, writeNet });
const cfg = readNet();
srv.listen(+process.env.PORT || cfg.port, cfg.lan ? '0.0.0.0' : '127.0.0.1').then(({ port }) => console.log(`FrioGest em http://127.0.0.1:${port}  (dados: ${dataDir})`));
