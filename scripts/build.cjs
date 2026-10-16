const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const presets = [...html.matchAll(/onclick="addPre\('([^']*)','([^']*)',([\d.]+),([\d.]+)\)"/g)]
  .map(([, n, d, q, p]) => ({ n: decode(n), d: decode(d), q: Number(q), p: Number(p) }));
if (!presets.length) throw Error('No service presets found.');
fs.mkdirSync(path.join(root, 'netlify', 'lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'netlify', 'lib', 'service-presets.json'), JSON.stringify(presets, null, 2) + '\n');
fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
for (const file of ['index.html', 'logo.webp', 'assets/invoice-ai-model.js', 'assets/invoice-assistant.js']) {
  fs.copyFileSync(path.join(root, file), path.join(root, 'dist', file));
}
console.log('Static invoice app built; server secrets are not included.');
