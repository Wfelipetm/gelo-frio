'use strict';
// Modo demonstração: banco temporário descartável, já com dados de exemplo e login automático.
// Nada aqui toca em dados reais — usado por `npm run demo` e pelo executável "FrioGest Demo".
const { hashPassword } = require('./db');
const { seed } = require('../scripts/seed');

const DEMO_USER = 'master';
const DEMO_PASS = 'demo-friogest'; // só existe dentro da instância de demonstração

/** Deixa o master pronto para entrar sem troca de senha (chamar logo após createServer). */
function prepareDemo(db) {
  const { salt, hash } = hashPassword(DEMO_PASS);
  db.prepare('UPDATE users SET pass_hash=?, pass_salt=?, must_change=0 WHERE id=1').run(hash, salt);
}

/** Popula os dados de exemplo via API local (chamar depois de listen). */
function seedDemo(port) {
  return seed({ base: `http://127.0.0.1:${port}`, user: DEMO_USER, pass: DEMO_PASS, quiet: true, force: true });
}

module.exports = { DEMO_USER, DEMO_PASS, prepareDemo, seedDemo };
