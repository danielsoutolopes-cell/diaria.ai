const fs = require('fs');
const path = require('path');

const sharpDir = path.join(process.cwd(), 'node_modules', 'sharp');
if (fs.existsSync(sharpDir)) {
  fs.rmSync(sharpDir, { recursive: true, force: true });
}
fs.mkdirSync(sharpDir, { recursive: true });
fs.writeFileSync(
  path.join(sharpDir, 'package.json'),
  JSON.stringify({ name: 'sharp', version: '0.0.0-cf-stub', main: 'index.js' }, null, 2)
);
fs.writeFileSync(
  path.join(sharpDir, 'index.js'),
  'module.exports = null;\n'
);
console.log('[stub-sharp-cf] sharp substituido por stub leve para Cloudflare Workers.');
