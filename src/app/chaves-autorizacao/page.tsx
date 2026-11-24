'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

interface PinResponse {
  success?: boolean;
  adminId?: 'patricia' | 'daniel';
  adminNome?: string;
  pin?: string;
  prefixo4?: string;
  sufixo4?: string;
  expiraEmMs?: number;
  segundosRestantes?: number;
  error?: string;
}

function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

export default function ChavesAutorizacaoPage() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [adminNome, setAdminNome] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [expiraEmMs, setExpiraEmMs] = useState<number>(0);
  const [segundosRestantes, setSegundosRestantes] = useState<number>(0);
  const [copiado, setCopiado] = useState(false);

  const carregarPin = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch('/api/dupla-alcada/pin', { cache: 'no-store' });
      const data = (await res.json()) as PinResponse;
      if (!res.ok || !data.success || !data.pin) {
        setErro(
          data.error ||
            'Acesso restrito a Patrícia Grubel e Daniel Lopes para gerar Chave Autorizante.'
        );
        return;
      }
      setAdminNome(data.adminNome || 'Administrador');
      setPin(data.pin);
      setExpiraEmMs(data.expiraEmMs || Date.now() + 180_000);
      setSegundosRestantes(data.segundosRestantes || 180);
    } catch {
      setErro('Erro de conexão ao gerar PIN autorizante.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarPin();
  }, [carregarPin]);

  useEffect(() => {
    if (!expiraEmMs) return;
    const timer = setInterval(() => {
      const rest = Math.max(0, Math.ceil((expiraEmMs - Date.now()) / 1000));
      setSegundosRestantes(rest);
      if (rest <= 0) {
        void carregarPin();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiraEmMs, carregarPin]);

  async function copiarPin() {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // ignora
    }
  }

  const pct = Math.min(100, Math.max(0, (segundosRestantes / 180) * 100));

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-900 text-amber-300">
          <Lock className="w-3 h-3" />
          DUPLA ALÇADA • VALIDADE 3 MINUTOS
        </span>
        <h1 className="text-2xl font-black text-slate-950 flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-emerald-700" />
          <span>Chave Autorizante (PIN Efêmero)</span>
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          Para editar ou excluir qualquer lançamento com mais de{' '}
          <strong>24 horas</strong>, o sistema exige simultaneamente o PIN da{' '}
          <strong>Patrícia</strong> e o PIN do <strong>Daniel</strong>. Cada
          chave expira automaticamente em <strong>3 minutos</strong>.
        </p>
      </div>

      {erro ? (
        <div className="p-5 rounded-3xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
          <div className="flex items-center gap-2 font-black text-sm">
            <ShieldAlert className="w-5 h-5" />
            <span>Acesso Restrito</span>
          </div>
          <p className="text-xs">{erro}</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase">
                  Chave exclusiva de
                </p>
                <p className="text-sm font-black text-slate-950">
                  {carregando ? 'Carregando...' : adminNome}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-black tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatarTempo(segundosRestantes)}</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-950 text-center space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              Chave Autenticadora (8 dígitos • 4 visíveis + 4 secretos)
            </p>
            <p className="text-4xl sm:text-5xl font-black tracking-[0.2em] text-white font-mono tabular-nums">
              {carregando ? '••••-••••' : `${pin.slice(0, 4)}-${pin.slice(4, 8)}`}
            </p>
            <p className="text-[11px] text-slate-400">
              Os 4 primeiros dígitos aparecem no registro; informe os 4 últimos (ou os 8 completos) para autorizar.
            </p>
          </div>

          {/* Barra de validade */}
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void copiarPin()}
              disabled={carregando || !pin}
              className="flex-1 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {copiado ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>PIN Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Meu PIN</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void carregarPin()}
              disabled={carregando}
              className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`}
              />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
