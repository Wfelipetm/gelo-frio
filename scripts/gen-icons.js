// Gera public/js/icons.js a partir do lucide-static (devDependency).
// Uso: node scripts/gen-icons.js   (rode de novo ao adicionar um ícone na lista abaixo)
const fs = require('fs');
const path = require('path');

const NAMES = [
  'snowflake', 'layout-dashboard', 'shopping-cart', 'receipt', 'file-text', 'wrench', 'package', 'flask-conical',
  'users', 'circle-dollar-sign', 'chart-column', 'key-round', 'settings', 'save', 'eye', 'menu', 'x', 'plus',
  'check', 'check-check', 'arrow-left', 'arrow-right', 'download', 'upload', 'undo-2', 'printer', 'tag',
  'calculator', 'message-circle', 'triangle-alert', 'user', 'phone', 'mail', 'id-card', 'map-pin', 'search',
  'bell', 'square-check', 'square', 'lock', 'camera', 'play', 'panel-left-close', 'panel-left-open', 'refresh-cw', 'circle-check', 'log-out', 'compass',
];

const dir = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const out = {};
for (const n of NAMES) {
  const svg = fs.readFileSync(path.join(dir, n + '.svg'), 'utf8');
  out[n] = [...svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*\/>/g)].map(m => m[0]).join('');
}

const js = `// GERADO por scripts/gen-icons.js — não edite à mão. Ícones: Lucide (https://lucide.dev, licença ISC).
const PATHS = ${JSON.stringify(out, null, 1)};

/** SVG inline do ícone Lucide \`name\`. Herda a cor do texto (currentColor). */
export function icon(name, size = 16, cls = '') {
  const p = PATHS[name];
  if (p === undefined) { console.warn('Ícone Lucide inexistente:', name); return ''; }
  return \`<svg class="lu \${cls}" xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">\${p}</svg>\`;
}
`;
fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'icons.js'), js);
console.log('icons.js gerado com', NAMES.length, 'ícones');
