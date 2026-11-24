import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { supabaseAdmin } from '@/lib/supabase';

export interface SupabaseAuthStateResult {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearSession: () => Promise<void>;
}

/**
 * Adapter oficial de persistência contínua do Baileys no Supabase
 * (tabela public.baileys_session_state) com cache em memória e batch upsert.
 */
export async function useSupabaseAuthState(
  sessionId = process.env.BAILEYS_SESSION_ID || 'default'
): Promise<SupabaseAuthStateResult> {
  const memoryCache = new Map<string, unknown>();

  const { data: rows, error } = await supabaseAdmin
    .from('baileys_session_state')
    .select('key_name, data')
    .eq('session_id', sessionId);

  if (!error && Array.isArray(rows)) {
    for (const row of rows) {
      const k = String(row.key_name);
      const revived = JSON.parse(
        JSON.stringify(row.data),
        BufferJSON.reviver
      ) as unknown;
      memoryCache.set(k, revived);
    }
  }

  let creds: AuthenticationCreds;
  const cachedCreds = memoryCache.get('creds');
  if (cachedCreds && typeof cachedCreds === 'object') {
    creds = cachedCreds as AuthenticationCreds;
  } else {
    creds = initAuthCreds();
    memoryCache.set('creds', creds);
  }

  const pendingUpserts = new Map<string, unknown>();
  const pendingDeletes = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function flushPending(): Promise<void> {
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
        data: JSON.parse(JSON.stringify(val, BufferJSON.replacer)) as Record<
          string,
          unknown
        >,
        updated_at: nowIso,
      }));
      await supabaseAdmin
        .from('baileys_session_state')
        .upsert(payload, { onConflict: 'session_id,key_name' });
    }

    if (deletes.length > 0) {
      await supabaseAdmin
        .from('baileys_session_state')
        .delete()
        .eq('session_id', sessionId)
        .in('key_name', deletes);
    }
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      void flushPending();
    }, 350);
  }

  async function saveCreds(): Promise<void> {
    memoryCache.set('creds', creds);
    pendingUpserts.set('creds', creds);
    await flushPending();
  }

  async function clearSession(): Promise<void> {
    memoryCache.clear();
    pendingUpserts.clear();
    pendingDeletes.clear();
    await supabaseAdmin
      .from('baileys_session_state')
      .delete()
      .eq('session_id', sessionId);
  }

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[]
      ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          const keyName = `${type}-${id}`;
          let value = memoryCache.get(keyName);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as Record<string, unknown>
            );
          }
          if (value !== undefined) {
            result[id] = value as SignalDataTypeMap[T];
          }
        }
        return result;
      },
      set: async (data) => {
        for (const category of Object.keys(data) as Array<
          keyof SignalDataTypeMap
        >) {
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
  };

  return { state, saveCreds, clearSession };
}
