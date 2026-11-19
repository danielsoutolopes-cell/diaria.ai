'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { listPendingOutbox, syncOutboxNow } from '@/lib/offlineOutbox';

export default function NetworkStatusBar() {
  const [online, setOnline] = useState<boolean>(true);
  const [pendentes, setPendentes] = useState<number>(0);
  const [sincronizando, setSincronizando] = useState<boolean>(false);
  const [toastSync, setToastSync] = useState<string | null>(null);

  async function atualizarFila() {
    const items = await listPendingOutbox();
    setPendentes(items.length);
  }

  async function handleSincronizar() {
    if (!navigator.onLine) return;
    setSincronizando(true);
    try {
      const { synced } = await syncOutboxNow();
      await atualizarFila();
      if (synced > 0) {
        setToastSync(`${synced} item(ns) offline sincronizado(s) com sucesso!`);
        setTimeout(() => setToastSync(null), 4000);
      }
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    void atualizarFila();

    const onOnline = () => {
      setOnline(true);
      void handleSincronizar();
    };
    const onOffline = () => setOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void handleSincronizar();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (online && pendentes === 0 && !toastSync) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg border text-xs font-bold flex items-center gap-2.5 print:hidden bg-slate-950 text-white border-slate-700">
      {!online ? (
        <>
          <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          <span>
            Modo Offline{pendentes > 0 ? ` • ${pendentes} na fila` : ' • Rascunhos salvos localmente'}
          </span>
        </>
      ) : toastSync ? (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastSync}</span>
        </>
      ) : (
        <>
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${sincronizando ? 'animate-spin' : ''}`} />
          <span>{pendentes} item(ns) aguardando sincronização</span>
          <button
            type="button"
            onClick={handleSincronizar}
            disabled={sincronizando}
            className="px-2.5 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black"
          >
            Sincronizar agora
          </button>
        </>
      )}
    </div>
  );
}
