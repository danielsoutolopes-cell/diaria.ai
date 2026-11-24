/**
 * Adapter CommonJS de persistência contínua do Baileys no Supabase
 * (tabela public.baileys_session_state) para uso direto em server-baileys.js.
 */
const {
  BufferJSON,
  initAuthCreds,
  proto,
} = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function useSupabaseAuthState(sessionId = 'default') {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const memoryCache = new Map();
  const { data: rows, error } = await supabase
    .from('baileys_session_state')
    .select('key_name, data')
    .eq('session_id', sessionId);

  if (!error && Array.isArray(rows)) {
    for (const row of rows) {
      try {
        const revived = JSON.parse(
          JSON.stringify(row.data),
          BufferJSON.reviver
        );
        memoryCache.set(String(row.key_name), revived);
      } catch {
        // ignora chave corrompida
      }
    }
    console.log(
      `[BAILEYS-SUPABASE] Carregadas ${rows.length} chaves da sessão '${sessionId}' do Supabase.`
    );
  }

  let creds = memoryCache.get('creds');
  if (!creds || typeof creds !== 'object') {
    creds = initAuthCreds();
    memoryCache.set('creds', creds);
  }

  const pendingUpserts = new Map();
  const pendingDeletes = new Set();
  let flushTimer = null;

  async function flushPending() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const upserts = Array.from(pendingUpserts.entries());
    const deletes = Array.from(pendingDeletes.values());
    pendingUpserts.clear();
    pendingDeletes.clear();

    if (upserts.length > 0) {
      const nowIso = new Date().toISOString();
      const payload = upserts.map(([key_name, val]) => ({
        session_id: sessionId,
        key_name,
        data: JSON.parse(JSON.stringify(val, BufferJSON.replacer)),
        updated_at: nowIso,
      }));
      const { error: upErr } = await supabase
        .from('baileys_session_state')
        .upsert(payload, { onConflict: 'session_id,key_name' });
      if (upErr) {
        console.error('[BAILEYS-SUPABASE] Erro no upsert:', upErr.message);
      }
    }

    if (deletes.length > 0) {
      await supabase
        .from('baileys_session_state')
        .delete()
        .eq('session_id', sessionId)
        .in('key_name', deletes);
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushPending().catch(() => {});
    }, 350);
  }

  async function saveCreds() {
    memoryCache.set('creds', creds);
    pendingUpserts.set('creds', creds);
    await flushPending();
  }

  async function clearSession() {
    memoryCache.clear();
    pendingUpserts.clear();
    pendingDeletes.clear();
    await supabase
      .from('baileys_session_state')
      .delete()
      .eq('session_id', sessionId);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            const keyName = `${type}-${id}`;
            let value = memoryCache.get(keyName);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            if (value !== undefined) {
              result[id] = value;
            }
          }
          return result;
        },
        set: async (data) => {
          for (const category of Object.keys(data)) {
            const categoryMap = data[category];
            if (!categoryMap) continue;
            for (const id of Object.keys(categoryMap)) {
              const value = categoryMap[id];
              const keyName = `${category}-${id}`;
              if (value !== null && value !== undefined) {
                memoryCache.set(keyName, value);
                pendingDeletes.delete(keyName);
                pendingUpserts.set(keyName, value);
              } else {
                memoryCache.delete(keyName);
                pendingUpserts.delete(keyName);
                pendingDeletes.add(keyName);
              }
            }
          }
          scheduleFlush();
        },
      },
    },
    saveCreds,
    clearSession,
  };
}

module.exports = { useSupabaseAuthState };
