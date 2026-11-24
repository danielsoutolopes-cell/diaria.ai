/**
 * Utilitário de migração da sessão ativa do Baileys (WhatsApp) do Fly.io para o Supabase
 * (tabela public.baileys_session_state).
 *
 * Uso:
 *   node scripts/migrar-sessao-fly-para-supabase.js [appName] [sessionId]
 *   Ex.: node scripts/migrar-sessao-fly-para-supabase.js diaria-ai default
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

function carregarEnv(arquivo) {
  const full = path.join(process.cwd(), arquivo);
  if (!fs.existsSync(full)) return;
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

carregarEnv('.env.local');
carregarEnv('.env');

const APP_NAME = process.argv[2] || process.env.FLY_APP_NAME || 'diaria-ai';
const SESSION_ID = process.argv[3] || process.env.BAILEYS_SESSION_ID || 'default';
const TMP_DIR = path.join(process.cwd(), `.tmp-fly-session-${Date.now()}`);

function limparTmp() {
  try {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
  } catch {
    // ignora
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      '❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const flyBin = process.platform === 'win32' ? 'flyctl.exe' : 'flyctl';
  const candidateRemoteDirs = [
    '/data/.baileys_service_auth',
    '/app/.baileys_service_auth',
    '/app/.baileys_auth',
    '/data/.baileys_auth',
    '/data/auth_info_baileys',
    '/app/auth_info_baileys',
  ];

  fs.mkdirSync(TMP_DIR, { recursive: true });
  let baixou = false;

  for (const remoteDir of candidateRemoteDirs) {
    try {
      console.log(`🔍 Verificando diretório remoto no Fly.io (${APP_NAME}): ${remoteDir}`);
      const listOut = execFileSync(
        flyBin,
        ['ssh', 'console', '-a', APP_NAME, '-C', `ls -1 ${remoteDir}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 25000 }
      );
      const files = listOut
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((f) => f.endsWith('.json'));

      if (files.length === 0) continue;
      console.log(`📦 Encontrados ${files.length} arquivos JSON em ${remoteDir}. Baixando...`);

      for (const file of files) {
        const content = execFileSync(
          flyBin,
          ['ssh', 'console', '-a', APP_NAME, '-C', `cat ${remoteDir}/${file}`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }
        );
        fs.writeFileSync(path.join(TMP_DIR, file), content, 'utf8');
      }
      baixou = true;
      break;
    } catch {
      // tenta próximo diretório ou cai no fallback local
    }
  }

  // Fallback: se Fly.io estiver suspenso/indisponível, tenta pasta local .baileys_auth
  let sourceDir = TMP_DIR;
  if (!baixou) {
    const localAuth = path.join(process.cwd(), '.baileys_auth');
    if (fs.existsSync(localAuth)) {
      const localJson = fs
        .readdirSync(localAuth)
        .filter((f) => f.endsWith('.json'));
      if (localJson.length > 0) {
        console.log(
          `⚠️ Fly.io indisponível/suspenso. Usando fallback local (${localJson.length} arquivos em .baileys_auth).`
        );
        sourceDir = localAuth;
        baixou = true;
      }
    }
  }

  if (!baixou) {
    console.log(
      '⚠️ Nenhuma sessão ativa encontrada no Fly.io (máquina pode estar suspensa) nem em .baileys_auth local. Assim que o Render conectar ou escanear o QR/Pairing Code, o adapter useSupabaseAuthState salvará automaticamente em baileys_session_state.'
    );
    limparTmp();
    return;
  }

  const jsonFiles = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith('.json'));

  const rows = [];
  for (const file of jsonFiles) {
    try {
      const raw = fs.readFileSync(path.join(sourceDir, file), 'utf8').trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const keyName = file.replace(/\.json$/i, '');
      rows.push({
        session_id: SESSION_ID,
        key_name: keyName,
        data: parsed,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`⚠️ Ignorando JSON inválido (${file}):`, err.message);
    }
  }

  if (rows.length === 0) {
    console.log('⚠️ Nenhum registro válido para importar.');
    limparTmp();
    return;
  }

  // Upsert em lotes de 50
  let gravados = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase
      .from('baileys_session_state')
      .upsert(batch, { onConflict: 'session_id,key_name' });
    if (error) {
      console.error('❌ Erro ao gravar lote no Supabase:', error.message);
      limparTmp();
      process.exit(1);
    }
    gravados += batch.length;
  }

  console.log(
    `✅ Migração concluída: ${gravados} chaves gravadas em baileys_session_state (session_id='${SESSION_ID}').`
  );
  limparTmp();
}

main().catch((err) => {
  console.error('❌ Falha na migração:', err);
  limparTmp();
  process.exit(1);
});
