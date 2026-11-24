'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import type {
  BaileysSessionResumo,
  ChaveAmbienteItem,
} from '@/lib/chavesAmbiente';

interface ChavesAmbienteResponse {
  success?: boolean;
  somenteLeitura?: boolean;
  consultadoPor?: string;
  chaves?: ChaveAmbienteItem[];
  baileysSession?: BaileysSessionResumo;
  error?: string;
}

function formatarDataHoraBR(iso: string | null | undefined): string {
  if (!iso) return 'Sem registro';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ChavesAmbienteReadOnlyPanel() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [chaves, setChaves] = useState<ChaveAmbienteItem[]>([]);
  const [baileysSession, setBaileysSession] =
    useState<BaileysSessionResumo | null>(null);
  const [reveladas, setReveladas] = useState<Record<string, boolean>>({});
  const [segredosCarregados, setSegredosCarregados] = useState(false);
  const [copiadaChave, setCopiadaChave] = useState<string | null>(null);

  const carregar = useCallback(async (revelar = false) => {
    setCarregando(true);
    setErro(null);
    try {
      const url = revelar
        ? '/api/config-geral/chaves-ambiente?revelar=1'
        : '/api/config-geral/chaves-ambiente';
      const res = await fetch(url, { cache: 'no-store' });
      const data = (await res.json()) as ChavesAmbienteResponse;
      if (!res.ok || !data.success) {
        setErro(
          data.error ||
            'Não foi possível carregar as Chaves de Ambiente (acesso restrito).'
        );
        return;
      }
      setChaves(data.chaves || []);
      setBaileysSession(data.baileysSession || null);
      if (revelar) setSegredosCarregados(true);
    } catch {
      setErro('Erro de conexão ao consultar chaves de infraestrutura.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(false);
  }, [carregar]);

  async function garantirSegredosEExecutar(
    nomeChave: string,
    acao: 'toggle' | 'copy'
  ) {
    let listaAtual = chaves;
    const alvoAtual = listaAtual.find((c) => c.nome === nomeChave);

    if (alvoAtual?.secreta && !alvoAtual.valorCompleto && !segredosCarregados) {
      try {
        const res = await fetch(
          '/api/config-geral/chaves-ambiente?revelar=1',
          { cache: 'no-store' }
        );
        const data = (await res.json()) as ChavesAmbienteResponse;
        if (res.ok && data.success && data.chaves) {
          listaAtual = data.chaves;
          setChaves(data.chaves);
          setSegredosCarregados(true);
        }
      } catch {
        setErro('Falha ao revelar valor protegido.');
        return;
      }
    }

    if (acao === 'toggle') {
      setReveladas((prev) => ({ ...prev, [nomeChave]: !prev[nomeChave] }));
      return;
    }

    const alvo = listaAtual.find((c) => c.nome === nomeChave);
    const valorParaCopiar = alvo?.valorCompleto || '';
    if (!valorParaCopiar) return;

    try {
      await navigator.clipboard.writeText(valorParaCopiar);
      setCopiadaChave(nomeChave);
      setTimeout(() => setCopiadaChave(null), 2000);
    } catch {
      setErro('Não foi possível copiar para a área de transferência.');
    }
  }

  return (
    <section
      aria-label="Chaves de Ambiente e Integrações (Somente Leitura)"
      className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-emerald-700" />
              <span>Chaves de Ambiente &amp; Integrações</span>
            </h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-900 text-amber-300">
              <Lock className="w-3 h-3" />
              SOMENTE LEITURA · SUPER ADMIN
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Visão auditável das variáveis de infraestrutura (Render, Supabase,
            Cloudflare R2 e GitHub Actions). Não editável pela interface — uso
            exclusivo para conferência e cópia segura de Secrets.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void carregar(segredosCarregados)}
          disabled={carregando}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 self-start sm:self-center disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`}
          />
          <span>Atualizar</span>
        </button>
      </div>

      {erro && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {carregando && chaves.length === 0 ? (
        <div className="space-y-2.5 animate-pulse">
          <div className="h-16 rounded-2xl bg-slate-100" />
          <div className="h-16 rounded-2xl bg-slate-100" />
          <div className="h-16 rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {chaves.map((chave) => {
              const ativa = chave.status === 'CONFIGURADA';
              const mostrando = Boolean(reveladas[chave.nome]);
              const valorExibido =
                mostrando && chave.valorCompleto
                  ? chave.valorCompleto
                  : chave.valorMascarado;
              const copiada = copiadaChave === chave.nome;

              return (
                <div
                  key={chave.nome}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-black text-slate-950 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                        {chave.nome}
                      </code>
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          ativa
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {ativa ? 'Ativa' : 'Ausente'}
                      </span>
                      {chave.ondeUsada.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-slate-600 border border-slate-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {chave.descricao}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full lg:w-auto">
                    <input
                      type="text"
                      readOnly
                      disabled
                      aria-label={`Valor de ${chave.nome}`}
                      value={valorExibido}
                      className="flex-1 lg:w-64 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-700 disabled:opacity-90 cursor-default"
                    />

                    {chave.secreta && ativa && (
                      <button
                        type="button"
                        onClick={() =>
                          void garantirSegredosEExecutar(chave.nome, 'toggle')
                        }
                        title={mostrando ? 'Ocultar valor' : 'Mostrar valor'}
                        className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700"
                      >
                        {mostrando ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!ativa}
                      onClick={() =>
                        void garantirSegredosEExecutar(chave.nome, 'copy')
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all disabled:opacity-40 ${
                        copiada
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      {copiada ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumo da Sessão Baileys (baileys_session_state) */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-emerald-300">
                    Sessão WhatsApp (baileys_session_state)
                  </h3>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      baileysSession?.disponivel
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {baileysSession?.disponivel ? 'Ativa no Banco' : 'Local / Ausente'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Server className="w-3 h-3 text-slate-400" />
                    session_id:{' '}
                    <strong className="text-white">
                      {baileysSession?.session_id || '—'}
                    </strong>
                  </span>
                  <span>
                    Chaves salvas:{' '}
                    <strong className="text-white">
                      {baileysSession?.total_chaves ?? 0}
                    </strong>
                  </span>
                  <span>
                    Atualizada em:{' '}
                    <strong className="text-white">
                      {formatarDataHoraBR(baileysSession?.updated_at)}
                    </strong>
                  </span>
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
