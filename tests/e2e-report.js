'use strict';
// Gera o relatório HTML do teste E2E com um print por passo e a lista das ações feitas. Usado por: SHOTS=pasta npm run test:e2e
// Saída (dentro da pasta de prints):
//   relatorio-e2e.html            → página completa, com as imagens embutidas (abre direto no navegador / dá para mandar por e-mail)
//   relatorio-e2e.fragmento.html  → só o conteúdo, sem <html>/<head> (para publicar como página na web)
const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
:root{--bg:#F3F6FA;--surface:#FFFFFF;--ink:#13233A;--muted:#55667E;--line:#CBD5E2;--az:#1F5FBF;--az-bg:#E3EEFC;--ve:#1B7547;--ve-bg:#E0F4E8;--vm:#B3261E;--vm-bg:#FCE6E3;
  --sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'IBM Plex Mono',ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E1726;--surface:#14203A;--ink:#E7EEF8;--muted:#9AABC3;--line:#2C3C57;--az:#6BA6FF;--az-bg:#14284A;--ve:#5ED39A;--ve-bg:#10372A;--vm:#FF8A80;--vm-bg:#411B1A;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E1726;--surface:#14203A;--ink:#E7EEF8;--muted:#9AABC3;--line:#2C3C57;--az:#6BA6FF;--az-bg:#14284A;--ve:#5ED39A;--ve-bg:#10372A;--vm:#FF8A80;--vm-bg:#411B1A;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.55;margin:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0}
.wrap{max-width:1100px;margin:0 auto}
header{padding:36px 0 18px}
.kicker{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--az)}
h1{font-size:clamp(26px,4.5vw,38px);line-height:1.15;margin:8px 0 10px;text-wrap:balance}
.lead{color:var(--muted);max-width:68ch;margin:0}
.sum{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 6px}
.sum div{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:120px}
.sum b{display:block;font-size:24px;font-variant-numeric:tabular-nums}
.sum span{font-size:12.5px;color:var(--muted)}
.sum .okc b{color:var(--ve)}.sum .badc b{color:var(--vm)}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
nav a{font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--line);background:var(--surface);padding:6px 12px;border-radius:999px}
nav a:hover,nav a:focus-visible{border-color:var(--az);color:var(--az);outline:none}
h2{font-size:21px;margin:42px 0 14px;padding-top:18px;border-top:1px solid var(--line)}
.step{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px;display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:18px}
.step.fail{border-color:var(--vm)}
.step h3{font-size:16px;line-height:1.35;margin:0 0 8px;display:flex;gap:10px;align-items:flex-start}
.n{flex:none;font-family:var(--mono);font-size:12px;background:var(--az-bg);color:var(--az);border-radius:6px;padding:2px 7px;margin-top:2px}
.tag{display:inline-block;font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:5px;margin-right:8px}
.tag.ok{background:var(--ve-bg);color:var(--ve)}.tag.fail{background:var(--vm-bg);color:var(--vm)}
.meta{font-size:12.5px;color:var(--muted);margin:0 0 10px}
.lbl{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:12px 0 4px}
ol.acoes{margin:0;padding-left:20px;display:grid;gap:3px;font-size:14px}
.erro{background:var(--vm-bg);color:var(--vm);border-radius:8px;padding:8px 10px;font-size:13px;margin-top:10px;word-break:break-word}
figure{margin:0;min-width:0}
figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
figcaption{font-size:12px;color:var(--muted);margin-top:6px}
footer{padding:20px 0 44px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:30px}
@media (max-width:820px){.step{grid-template-columns:minmax(0,1fr)}}
`;

function corpo(relat, titulo) {
  const total = relat.length, oks = relat.filter(r => r.ok).length, falhas = total - oks;
  const seg = relat.reduce((a, r) => a + r.ms, 0) / 1000;
  const secoes = [...new Set(relat.map(r => r.secao))];
  const id = s => 's' + (secoes.indexOf(s) + 1);
  let n = 0, out = '';
  out += `<div class="wrap"><header><div class="kicker">FrioGest · teste de ponta a ponta</div><h1>${esc(titulo)}</h1>
<p class="lead">O teste abre o sistema num Chrome de verdade e usa as telas como uma pessoa usaria: clica, digita e confere o resultado. Cada passo abaixo mostra o que foi feito e o print da tela no fim do passo. O banco usado é temporário, sem relação com os dados reais.</p>
<div class="sum"><div class="okc"><b>${oks}</b><span>passos aprovados</span></div><div class="${falhas ? 'badc' : ''}"><b>${falhas}</b><span>com falha</span></div><div><b>${total}</b><span>passos no total</span></div><div><b>${seg.toFixed(0)} s</b><span>tempo somado dos passos</span></div></div>
<nav aria-label="Seções">${secoes.map(s => `<a href="#${id(s)}">${esc(s)}</a>`).join('')}</nav></header>`;
  for (const s of secoes) {
    out += `<h2 id="${id(s)}">${esc(s)}</h2>`;
    for (const r of relat.filter(x => x.secao === s)) {
      n++;
      out += `<section class="step ${r.ok ? '' : 'fail'}"><div><h3><span class="n">${String(n).padStart(2, '0')}</span><span>${esc(r.nome)}</span></h3>
<p class="meta"><span class="tag ${r.ok ? 'ok' : 'fail'}">${r.ok ? 'aprovado' : 'falhou'}</span>${(r.ms / 1000).toFixed(1)} s</p>
<div class="lbl">O que o teste fez</div>${r.acoes.length ? `<ol class="acoes">${r.acoes.map(a => `<li>${esc(a)}</li>`).join('')}</ol>` : '<p class="meta">Só conferiu o estado do sistema, sem clicar em nada.</p>'}
${r.erro ? `<div class="erro">${esc(r.erro)}</div>` : ''}</div>
<figure><img loading="lazy" alt="Tela do sistema ao fim do passo ${n}: ${esc(r.nome)}" src="data:image/jpeg;base64,${r.b64}"><figcaption>Tela no fim do passo</figcaption></figure></section>`;
    }
  }
  out += `<footer>Gerado em ${new Date().toLocaleString('pt-BR')} por tests/e2e.js (SHOTS=pasta). Os prints são do navegador em 1366 × 820.</footer></div>`;
  return out;
}

function gerar(relat, dir, titulo = 'Relatório do teste de ponta a ponta') {
  const head = `<title>Teste de ponta a ponta</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">\n<style>${CSS}</style>`;
  const body = corpo(relat, titulo);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'relatorio-e2e.fragmento.html'), `${head}\n${body}\n`);
  const f = path.join(dir, 'relatorio-e2e.html');
  fs.writeFileSync(f, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n${head}</head><body>${body}</body></html>`);
  return f;
}

module.exports = { gerar };
