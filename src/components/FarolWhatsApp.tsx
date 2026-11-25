'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type FarolCor = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'STAND_BY';

interface StatusResp {
  farol?: FarolCor;
  status?: string;
  groupsCount?: number;
}

export default function FarolWhatsApp() {
  const [farol, setFarol] = useState<FarolCor>('AMARELO');
  const [sincronizando, setSincronizando] = useState(false);
  const autoWakeFeitoRef = useRef(false);

  const consultarStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
      if (!res.ok) {
        setFarol('VERMELHO');
        return 'VERMELHO' as FarolCor;
      }
      const data = (await res.json()) as StatusResp;
      const cor = data.farol || 'VERMELHO';
      setFarol(cor);
      return cor;
    } catch {
      setFarol('VERMELHO');
      return 'VERMELHO' as FarolCor;
    }
  }, []);

  const acionarWake = useCallback(async () => {
    setSincronizando(true);
    setFarol('AMARELO');
    try {
      await fetch('/api/whatsapp/wake', { method: 'POST' });
      await new Promise((r) => setTimeout(r, 1500));
      await consultarStatus();
    } catch {
      setFarol('VERMELHO');
    } finally {
      setSincronizando(false);
    }
  }, [consultarStatus]);

  useEffect(() => {
    let ativo = true;
    void consultarStatus().then((cor) => {
      if (ativo && cor === 'VERMELHO' && !autoWakeFeitoRef.current) {
        autoWakeFeitoRef.current = true;
        void acionarWake();
      }
    });
    const timer = setInterval(() => {
      void consultarStatus();
    }, 30000);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [consultarStatus, acionarWake]);

  const dotClass =
    farol === 'VERDE'
      ? 'bg-emerald-400'
      : farol === 'STAND_BY'
        ? 'bg-amber-400'
        : farol === 'AMARELO'
          ? 'bg-amber-400 animate-pulse'
          : 'bg-rose-500';

  const label =
    farol === 'VERDE'
      ? 'WhatsApp Online'
      : farol === 'STAND_BY'
        ? 'WhatsApp Stand-By'
        : farol === 'AMARELO'
          ? 'Sincronizando...'
          : 'Dormindo / Offline';

  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/70 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[11px] font-bold text-slate-200 truncate">
          {label}
        </span>
      </div>
      <button
        type="button"
        disabled={sincronizando}
        onClick={() => void acionarWake()}
        title="Sincronizar Agora"
        className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-emerald-600 text-[10px] font-black text-white flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
      >
        <RefreshCw
          className={`w-3 h-3 ${sincronizando ? 'animate-spin' : ''}`}
        />
        <span>Sincronizar</span>
      </button>
    </div>
  );
}
