const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'backend', 'src');

function parseExports(src) {
  const keys = new Set();
  const obj = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\n\}/);
  if (obj) {
    for (const m of obj[1].matchAll(/^\s*([A-Za-z_][\w]*)\s*(,|:|$)/gm)) keys.add(m[1]);
    for (const m of obj[1].matchAll(/^\s*([A-Za-z_][\w]*)\s*:/gm)) keys.add(m[1]);
  }
  for (const m of src.matchAll(/exports\.([A-Za-z_][\w]*)\s*=/g)) keys.add(m[1]);
  const single = src.match(/module\.exports\s*=\s*([A-Za-z_][\w]*)\s*;/);
  if (single) keys.add(single[1]);
  return [...keys];
}

function parseFns(src) {
  const map = new Map();
  const patterns = [
    /(?:async\s+)?function\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/g,
    /(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:asyncHandler\s*)?\(\s*(?:async\s*)?\(([^)]*)\)/g,
    /(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*async\s*\(([^)]*)\)/g,
    /(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      if (!map.has(m[1])) map.set(m[1], m[2].replace(/\s+/g, ' ').trim());
    }
  }
  for (const m of src.matchAll(/^\s*(?:async\s+)?([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*\{/gm)) {
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return'].includes(m[1])) continue;
    if (!map.has(m[1])) map.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  }
  return map;
}

function requires(src) {
  return [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
}

function snippetAfter(src, name) {
  const idx = src.search(new RegExp(`(?:function\\s+${name}\\s*\\(|const\\s+${name}\\s*=)`));
  if (idx < 0) return '';
  return src.slice(idx, idx + 900).replace(/\s+/g, ' ').slice(0, 700);
}

function processDir(dir) {
  const abs = path.join(root, dir);
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const src = fs.readFileSync(path.join(abs, f), 'utf8');
      const exportKeys = parseExports(src);
      const fns = parseFns(src);
      const methods = exportKeys
        .filter((k) => fns.has(k) || /[a-z]/.test(k[0]))
        .map((k) => ({
          name: k,
          params: fns.get(k) ?? '',
          snippet: snippetAfter(src, k),
        }));
      return {
        file: f,
        rel: `${dir}/${f}`,
        exportKeys,
        methods,
        requires: requires(src),
        hasClass: /class\s+[A-Z]/.test(src),
      };
    });
}

const data = {
  controllers: processDir('controllers'),
  services: processDir('services'),
  repositories: processDir('repositories'),
  middleware: processDir('middleware'),
  providers: processDir('providers'),
  sockets: processDir('sockets'),
};

fs.writeFileSync(path.join(__dirname, '_signatures.json'), JSON.stringify(data, null, 2));
console.log('controllers', data.controllers.length);
console.log('services methods', data.services.reduce((n, s) => n + s.methods.length, 0));
console.log('repos', data.repositories.map((r) => `${r.file}:${r.exportKeys.join(',')}`).join('\n'));
