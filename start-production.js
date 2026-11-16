const { spawn } = require('child_process');

console.log('[PROD-RUNNER] Iniciando Diária.AI no Render...');

// 1. Iniciar Microserviço Baileys em Background
const baileys = spawn('node', ['server-baileys.js'], {
  stdio: 'inherit',
  env: process.env,
});

baileys.on('error', (err) => {
  console.error('[PROD-RUNNER] Erro ao iniciar Baileys:', err);
});

// 2. Iniciar Next.js Production Server na porta configurada pelo Render ($PORT)
const port = process.env.PORT || 3000;
const next = spawn('npx', ['next', 'start', '-p', String(port)], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

next.on('error', (err) => {
  console.error('[PROD-RUNNER] Erro ao iniciar Next.js:', err);
});

// Encerramento limpo
function shutdown() {
  console.log('[PROD-RUNNER] Encerrando processos...');
  try { baileys.kill(); } catch(e){}
  try { next.kill(); } catch(e){}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
