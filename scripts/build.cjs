const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
for (const file of ['index.html', 'logo.webp', 'assets/invoice-ai-model.js', 'assets/invoice-assistant.js']) {
  fs.copyFileSync(path.join(root, file), path.join(root, 'dist', file));
}
console.log('Static invoice app built; server secrets are not included.');
