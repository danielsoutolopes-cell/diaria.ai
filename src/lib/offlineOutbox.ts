'use client';

export type OutboxEntityType =
  | 'daily_attendance'
  | 'advance_payment'
  | 'diario_obra'
  | 'caixa_campo';

export interface OutboxItem {
  idempotencyKey: string;
  entityType: OutboxEntityType;
  tenantId: string;
  endpoint: string;
  payload: Record<string, unknown>;
  createdAtClient: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
}

const DB_NAME = 'diaria_ai_offline_db';
const STORE_NAME = 'outbox';
const DB_VERSION = 1;

function openOutboxDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB não disponível neste ambiente.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'idempotencyKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOutboxItem(
  item: Omit<OutboxItem, 'createdAtClient' | 'syncStatus' | 'retryCount'>
): Promise<void> {
  const db = await openOutboxDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const fullItem: OutboxItem = {
      ...item,
      createdAtClient: new Date().toISOString(),
      syncStatus: 'pending',
      retryCount: 0,
    };
    store.put(fullItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingOutbox(): Promise<OutboxItem[]> {
  try {
    const db = await openOutboxDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const all = (req.result as OutboxItem[]) || [];
        resolve(all.filter((i) => i.syncStatus !== 'synced'));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function syncOutboxNow(): Promise<{ synced: number; failed: number }> {
  const pending = await listPendingOutbox();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const db = await openOutboxDB();

  for (const item of pending) {
    try {
      const res = await fetch(item.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey,
        },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(item.idempotencyKey);
          tx.oncomplete = () => resolve();
        });
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
