const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'backend', 'src');

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function extract(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replace(/\\/g, '/');

  const exportObj = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\};?/);
  const exportKeys = [];
  if (exportObj) {
    const body = exportObj[1];
    for (const m of body.matchAll(/([A-Za-z_][\w]*)\s*(?:,|:|$)/g)) {
      if (!['true', 'false', 'null'].includes(m[1])) exportKeys.push(m[1]);
    }
  }
  const exportAssigns = [...src.matchAll(/exports\.([A-Za-z_][\w]*)\s*=/g)].map((m) => m[1]);
  const exportDefault = [...src.matchAll(/module\.exports\s*=\s*([A-Za-z_][\w]*)/g)].map((m) => m[1]);

  const classes = [...src.matchAll(/class\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
  const classMethods = [...src.matchAll(/^\s*(async\s+)?([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*\{/gm)]
    .filter((m) => !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(m[2]))
    .map((m) => ({ name: m[2], params: m[3].replace(/\s+/g, ' ').trim(), async: Boolean(m[1]) }));

  const namedFns = [...src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/gm)].map((m) => ({
    name: m[1],
    params: m[2].replace(/\s+/g, ' ').trim(),
  }));
  const constFns = [
    ...src.matchAll(
      /^(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:asyncHandler\s*)?\(\s*(?:async\s*)?\(([^)]*)\)/gm
    ),
  ].map((m) => ({ name: m[1], params: m[2].replace(/\s+/g, ' ').trim() }));
  const arrowFns = [
    ...src.matchAll(/^(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*async\s*\(([^)]*)\)/gm),
  ].map((m) => ({ name: m[1], params: m[2].replace(/\s+/g, ' ').trim() }));

  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);

  return {
    rel,
    classes,
    exportKeys: [...new Set([...exportKeys, ...exportAssigns, ...exportDefault])],
    namedFns,
    constFns: [...constFns, ...arrowFns],
    classMethods,
    requires,
  };
}

const dirs = ['controllers', 'services', 'repositories', 'middleware', 'providers', 'sockets'];
const result = {};
for (const d of dirs) {
  const dir = path.join(root, d);
  if (!fs.existsSync(dir)) continue;
  result[d] = walk(dir).map(extract);
}

const outPath = path.join(__dirname, '_class_spec_extract.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log('Wrote', outPath);
for (const d of Object.keys(result)) {
  console.log(d, result[d].length, 'files');
}
