const { spawn } = require('child_process');

console.log('[PROD-RUNNER] Iniciando Ponto Patrícia (Diária.AI)...');

// Garante que o diretório persistente exista se DATA_DIR for definido
const fs = require('fs');
if (process.env.DATA_DIR && !fs.existsSync(process.env.DATA_DIR)) {
  try {
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
    console.log(`[PROD-RUNNER] Diretório de persistência criado em: ${process.env.DATA_DIR}`);
  } catch (err) {
    console.error('[PROD-RUNNER] Erro ao criar DATA_DIR:', err);
  }
}

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

// 3. Agendador Quinzenal (2ª e última sexta-feira do mês às 18:00 America/Sao_Paulo)
const cronInterval = setInterval(async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/cron/relatorio-quinzenal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.disparado) {
        console.log('[PROD-RUNNER][CRON-QUINZENAL] Relatório quinzenal disparado:', data.resumo || 'OK');
      }
    }
  } catch {
    // Servidor Next.js ainda inicializando ou em restart — ignora silenciosamente
  }
}, 60 * 1000);

// Encerramento limpo
function shutdown() {
  console.log('[PROD-RUNNER] Encerrando processos...');
  clearInterval(cronInterval);
  try { baileys.kill(); } catch(e){}
  try { next.kill(); } catch(e){}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
