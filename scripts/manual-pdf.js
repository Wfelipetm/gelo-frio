'use strict';
// Gera o PDF do manual a partir de manual/Manual-FrioGest.html (precisa de Chrome ou Edge).
//   node scripts/manual-pdf.js            -> manual/Manual-FrioGest.pdf
//   node scripts/manual-pdf.js <pasta>    -> também copia o PDF para essa pasta
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const DIR = path.join(__dirname, '..', 'manual');
const HTML = path.join(DIR, 'Manual-FrioGest.html');
const PDF = path.join(DIR, 'Manual-FrioGest.pdf');

const navegador = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(p => fs.existsSync(p));
if (!navegador) { console.error('Chrome/Edge não encontrado (defina CHROME).'); process.exit(1); }
if (!fs.existsSync(HTML)) { console.error('Rode antes: node scripts/manual-build.js'); process.exit(1); }

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'friogest-pdf-'));
try {
  fs.rmSync(PDF, { force: true });
  spawnSync(navegador, ['--headless=new', '--disable-gpu', `--user-data-dir=${perfil}`, '--no-pdf-header-footer', '--virtual-time-budget=15000',
    `--print-to-pdf=${PDF}`, pathToFileURL(HTML).href], { stdio: 'ignore', timeout: 120000 });
} finally { fs.rmSync(perfil, { recursive: true, force: true }); }

if (!fs.existsSync(PDF)) { console.error('Não consegui gerar o PDF.'); process.exit(1); }
console.log(`PDF: ${PDF} (${(fs.statSync(PDF).size / 1048576).toFixed(1)} MB)`);
if (process.argv[2]) { const d = path.resolve(process.argv[2]); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(PDF, path.join(d, 'Manual-FrioGest.pdf')); console.log('Copiado para ' + d); }
