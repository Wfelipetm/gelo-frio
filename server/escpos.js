'use strict';
// Construtor de comandos ESC/POS para impressoras térmicas (Elgin/Bematech MP-4200 TH/HS, Epson TM e compatíveis).
// Gera apenas bytes (Buffer): quem envia para a impressora é server/printer.js.

// Páginas de código (ESC t n): 850 = PC850 Multilingual (n=2) · 860 = PC860 Português (n=3)
const CP = {
  850: { n: 2, map: { 'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D, 'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'Ü': 0x9A, '£': 0x9C,
    'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6, 'º': 0xA7, '¿': 0xA8, 'Á': 0xB5, 'Â': 0xB6, 'À': 0xB7, '©': 0xB8, 'ã': 0xC6, 'Ã': 0xC7, 'Ê': 0xD2, 'È': 0xD4, 'Í': 0xD6, 'Ï': 0xD8, 'Ó': 0xE0, 'Ô': 0xE2, 'Ò': 0xE3, 'õ': 0xE4, 'Õ': 0xE5, 'Ú': 0xE9, 'Û': 0xEA, 'Ù': 0xEB, '±': 0xF1, '§': 0xF5, '°': 0xF8, '²': 0xFD } },
  860: { n: 3, map: { 'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ã': 0x84, 'à': 0x85, 'Á': 0x86, 'ç': 0x87, 'ê': 0x88, 'Ê': 0x89, 'è': 0x8A, 'Í': 0x8B, 'Ô': 0x8C, 'ì': 0x8D, 'Ã': 0x8E, 'Â': 0x8F, 'É': 0x90, 'À': 0x91, 'È': 0x92, 'ô': 0x93, 'õ': 0x94, 'ò': 0x95, 'Ú': 0x96, 'ù': 0x97, 'Ì': 0x98, 'Õ': 0x99, 'Ü': 0x9A, '£': 0x9C, 'Ù': 0x9D, 'Ó': 0x9F,
    'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6, 'º': 0xA7, '¿': 0xA8, 'Ò': 0xA9, '°': 0xF8, '²': 0xFD } },
};
const SUBST = { '–': '-', '—': '-', '‒': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '•': '*', '·': '-', '×': 'x', ' ': ' ', '€': 'EUR', '→': '->', '←': '<-' };

/** Converte texto em bytes da página de código; o que não existe vira ASCII aproximado (ou "?"). */
function encode(text, codepage = 850) {
  const cp = CP[codepage] || CP[850];
  const out = [];
  for (const ch of String(text ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c === 10 || c === 13 || (c >= 32 && c < 127)) { out.push(c); continue; }
    if (cp.map[ch] !== undefined) { out.push(cp.map[ch]); continue; }
    const sub = SUBST[ch];
    if (sub !== undefined) { for (const s of sub) out.push(s.charCodeAt(0)); continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out.push(base.length === 1 && base.charCodeAt(0) < 127 && base.charCodeAt(0) >= 32 ? base.charCodeAt(0) : 63);
  }
  return Buffer.from(out);
}

/** Inverso de encode() — usado nos testes para ler o que seria impresso. */
function decode(buf, codepage = 850) {
  const inv = {}; for (const [k, v] of Object.entries((CP[codepage] || CP[850]).map)) inv[v] = k;
  return [...buf].map(b => (b < 128 ? String.fromCharCode(b) : inv[b] || '?')).join('');
}

const ESC = 0x1B, GS = 0x1D, LF = 0x0A;

class Cupom {
  /** colunas: 48 (bobina 80 mm, fonte A) · 32 (58 mm) */
  constructor({ colunas = 48, codepage = 850 } = {}) {
    this.w = Math.max(24, Math.min(64, +colunas || 48));
    this.cp = CP[codepage] ? +codepage : 850;
    this.parts = [];
    this._raw(ESC, 0x40);                 // ESC @ : inicializa
    this._raw(ESC, 0x74, CP[this.cp].n);  // ESC t n : página de código
  }
  _raw(...b) { this.parts.push(Buffer.from(b)); return this; }
  _txt(s) { this.parts.push(encode(s, this.cp)); return this; }

  align(a) { return this._raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0); }
  bold(on = true) { return this._raw(ESC, 0x45, on ? 1 : 0); }
  /** largura/altura de 1 a 4 (GS ! n) */
  size(w = 1, h = 1) { return this._raw(GS, 0x21, (((Math.min(4, Math.max(1, w)) - 1) << 4) | (Math.min(4, Math.max(1, h)) - 1))); }
  normal() { return this.size(1, 1).bold(false).align('left'); }
  feed(n = 1) { return this._raw(ESC, 0x64, Math.max(0, Math.min(255, n))); }
  /** Quebra o texto em linhas de até `w` colunas (respeita palavras). */
  wrap(s, w = this.w) {
    const out = [];
    for (const par of String(s ?? '').split(/\r?\n/)) {
      let line = '';
      for (const word of par.split(/\s+/).filter(Boolean)) {
        let wd = word;
        while (wd.length > w) { if (line) { out.push(line); line = ''; } out.push(wd.slice(0, w)); wd = wd.slice(w); }
        if (!line) line = wd; else if ((line + ' ' + wd).length <= w) line += ' ' + wd; else { out.push(line); line = wd; }
      }
      out.push(line);
    }
    return out;
  }
  line(s = '') { return this._txt(s)._raw(LF); }
  /** texto longo, com quebra automática */
  text(s, w = this.w) { for (const l of this.wrap(s, w)) this.line(l); return this; }
  center(s, w = this.w) { for (const l of this.wrap(s, w)) this.line(' '.repeat(Math.max(0, Math.floor((w - l.length) / 2))) + l); return this; }
  /** esquerda ... direita na mesma linha (a esquerda é cortada/quebrada se faltar espaço) */
  lr(left, right, w = this.w) {
    left = String(left ?? ''); right = String(right ?? '');
    const room = w - right.length - 1;
    if (room < 4) { this.text(left, w); return this.line(' '.repeat(Math.max(0, w - right.length)) + right); }
    const ls = this.wrap(left, room);
    ls.forEach((l, i) => this.line(i === ls.length - 1 ? l + ' '.repeat(w - l.length - right.length) + right : l));
    return this;
  }
  hr(ch = '-') { return this.line(ch.repeat(this.w)); }
  /** QR Code (modelo 2). size 1–16 */
  qr(data, size = 6) {
    const d = encode(data, this.cp), len = d.length + 3;
    this._raw(GS, 0x28, 0x6B, 4, 0, 0x31, 0x41, 0x32, 0);          // modelo 2
    this._raw(GS, 0x28, 0x6B, 3, 0, 0x31, 0x43, Math.min(16, Math.max(1, size)));
    this._raw(GS, 0x28, 0x6B, 3, 0, 0x31, 0x45, 0x31);              // correção de erro M
    this._raw(GS, 0x28, 0x6B, len & 0xFF, len >> 8, 0x31, 0x50, 0x30); this.parts.push(d);
    return this._raw(GS, 0x28, 0x6B, 3, 0, 0x31, 0x51, 0x30);      // imprime
  }
  /** abre a gaveta de dinheiro (pino 2) */
  drawer() { return this._raw(ESC, 0x70, 0, 25, 250); }
  /** avança o papel e corta (corte parcial com guilhotina) */
  cut(feed = 4) { return this.feed(feed)._raw(GS, 0x56, 66, 0); }
  bytes() { return Buffer.concat(this.parts); }
}

/**
 * Interpreta os bytes ESC/POS gerados pelo Cupom e devolve as linhas "como saem no papel".
 * Serve para pré-visualizar e para imprimir em impressoras COMUNS (que não entendem ESC/POS).
 * Cobre o subconjunto que o FrioGest usa: init, página de código, alinhamento, negrito, tamanho, avanço, QR, gaveta e corte.
 */
function interpretar(buf) {
  let cp = 850, align = 0, bold = false, w = 1, h = 1, qr = null, gaveta = false;
  const linhas = []; let seg = []; let alinhaLinha = 0;
  const empurrar = ch => { if (!seg.length) alinhaLinha = align; seg.push({ t: ch, bold, w, h }); };
  const fecha = () => {
    seg = seg.reduce((acc, s) => { const u = acc[acc.length - 1]; if (u && u.bold === s.bold && u.w === s.w && u.h === s.h) u.t += s.t; else acc.push({ ...s }); return acc; }, []); // junta trechos vizinhos com o mesmo estilo
    linhas.push({ tipo: 'texto', align: alinhaLinha, w: Math.max(1, ...seg.map(s => s.w)), h: Math.max(1, ...seg.map(s => s.h)), segs: seg.length ? seg : [{ t: '', bold: false, w: 1, h: 1 }] });
    seg = [];
  };
  for (let i = 0; i < buf.length;) {
    const b = buf[i];
    if (b === 0x1B) {
      const c = buf[i + 1];
      if (c === 0x40) { align = 0; bold = false; w = 1; h = 1; i += 2; }
      else if (c === 0x74) { cp = buf[i + 2] === 3 ? 860 : 850; i += 3; }
      else if (c === 0x61) { align = buf[i + 2] & 3; i += 3; }
      else if (c === 0x45) { bold = !!(buf[i + 2] & 1); i += 3; }
      else if (c === 0x64) { if (seg.length) fecha(); for (let k = 0; k < buf[i + 2]; k++) linhas.push({ tipo: 'texto', align: 0, w: 1, h: 1, segs: [{ t: '', bold: false, w: 1, h: 1 }] }); i += 3; }
      else if (c === 0x70) { gaveta = true; i += 5; }
      else i += 2;
    } else if (b === 0x1D) {
      const c = buf[i + 1];
      if (c === 0x21) { const n = buf[i + 2]; w = (n >> 4) + 1; h = (n & 15) + 1; i += 3; }
      else if (c === 0x56) { if (seg.length) fecha(); linhas.push({ tipo: 'corte' }); i += (buf[i + 2] === 65 || buf[i + 2] === 66) ? 4 : 3; }
      else if (c === 0x28 && buf[i + 2] === 0x6B) {
        const len = buf[i + 3] + buf[i + 4] * 256, cn = buf[i + 5], fn = buf[i + 6];
        if (cn === 0x31 && fn === 0x50) qr = decode(buf.subarray(i + 8, i + 5 + len), cp);
        if (cn === 0x31 && fn === 0x51) { if (seg.length) fecha(); linhas.push({ tipo: 'qr', dados: qr || '' }); }
        i += 5 + len;
      } else i += 2;
    } else if (b === 0x0A) { fecha(); i++; }
    else if (b === 0x0D) i++;
    else { empurrar(decode(Buffer.from([b]), cp)); i++; }
  }
  if (seg.length) fecha();
  return { linhas, gaveta };
}

const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Página HTML (80 mm) com o cupom. colunas = largura em caracteres; auto = abre a janela de impressão ao carregar. */
function paraHtml(buf, { colunas = 48, titulo = 'Cupom', auto = false } = {}) {
  const { linhas } = interpretar(buf);
  const corpo = linhas.map(l => {
    if (l.tipo === 'corte') return '<div class="corte">- - - - - - - - - - - -  corte  - - - - - - - - - - - -</div>';
    if (l.tipo === 'qr') return `<div class="qr"><div>QR CODE</div><small>${escHtml(l.dados)}</small></div>`;
    const txt = l.segs.map(s => (s.bold ? `<b>${escHtml(s.t)}</b>` : escHtml(s.t))).join('');
    return `<div class="l" style="--w:${l.w};--h:${l.h};text-align:${['left', 'center', 'right'][l.align] || 'left'}">${txt || '&nbsp;'}</div>`;
  }).join('\n');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escHtml(titulo)}</title><style>
  @page{size:80mm auto;margin:0}
  *{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}
  body{width:80mm;padding:3mm 3mm 8mm;font-family:'Courier New',Courier,monospace;font-size:calc(74mm / ${+colunas || 48} / 0.6)}
  .l{white-space:pre;line-height:1.25;transform-origin:0 0;transform:scale(var(--w),var(--h));width:calc(100% / var(--w));margin-bottom:calc((var(--h) - 1) * 1.25em)}
  .l b{font-weight:700}
  .qr{margin:2mm auto;width:26mm;height:26mm;border:2px solid #000;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;text-align:center}.qr small{font-size:.5em;font-weight:400;word-break:break-all;padding:0 1mm}
  .corte{margin-top:4mm;text-align:center;color:#777;font-size:.7em;white-space:pre}
  .noprint{position:fixed;top:8px;right:12px;font-family:system-ui,sans-serif}
  .noprint button{font:600 13px system-ui;padding:8px 14px;border-radius:8px;border:1px solid #1a5fd0;background:#1a5fd0;color:#fff;cursor:pointer}
  @media screen{body{margin:18px auto;box-shadow:0 2px 16px rgba(0,0,0,.25);background:#fff}html{background:#e9edf3}}
  @media print{.noprint,.corte{display:none}}
  </style></head><body>${corpo}<div class="noprint"><button onclick="window.print()">Imprimir</button></div>${auto ? '<script>window.onload=()=>setTimeout(()=>window.print(),350)</script>' : ''}</body></html>`;
}

module.exports = { Cupom, encode, decode, interpretar, paraHtml };
