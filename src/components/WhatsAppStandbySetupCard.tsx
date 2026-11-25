'use client';

import React, { useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, Smartphone } from 'lucide-react';

export default function WhatsAppStandbySetupCard() {
  const [standby, setStandby] = useState<boolean>(true);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/whatsapp/standby', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { standby?: boolean }) => {
        setStandby(d.standby !== false);
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  async function alternarModo() {
    const proximo = !standby;
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch('/api/whatsapp/standby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ standby: proximo }),
      });
      const d = (await res.json()) as {
        success?: boolean;
        standby?: boolean;
        message?: string;
      };
      if (res.ok && d.success) {
        setStandby(d.standby === true);
        setMsg(d.message || null);
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-700" />
            <span>Integração WhatsApp (Baileys)</span>
          </h3>
          <span
            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
              standby
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}
          >
            {carregando ? '...' : standby ? 'STAND-BY (PAUSADO)' : 'ATIVO'}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {standby
            ? 'Ingestão automática e auto-wake pausados. Sessão preservada em baileys_session_state no Supabase — religue em 1 clique quando desejar.'
            : 'Ingestão automática de mensagens e sincronização do WhatsApp ativas.'}
        </p>
        {msg && (
          <p className="text-[11px] font-bold text-emerald-700">{msg}</p>
        )}
      </div>

      <button
        type="button"
        disabled={carregando || salvando}
        onClick={() => void alternarModo()}
        className={`px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 shrink-0 transition-all disabled:opacity-50 ${
          standby
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'bg-amber-500 hover:bg-amber-600 text-white'
        }`}
      >
        {standby ? (
          <>
            <PlayCircle className="w-4 h-4" />
            <span>{salvando ? 'Salvando...' : 'Religar WhatsApp (ATIVO)'}</span>
          </>
        ) : (
          <>
            <PauseCircle className="w-4 h-4" />
            <span>{salvando ? 'Salvando...' : 'Colocar em STAND-BY'}</span>
          </>
        )}
      </button>
    </section>
  );
}
