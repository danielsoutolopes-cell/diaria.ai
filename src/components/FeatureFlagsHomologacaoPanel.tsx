'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type {
  FeatureFlagKey,
  FeatureFlagMetadata,
  FeatureFlagsHomologacao,
} from '@/services/featureFlagsStorage';
import type { TenantSlug } from '@/lib/tenant';

interface FeatureFlagsApiResponse {
  success?: boolean;
  porEmpresa?: Record<TenantSlug, FeatureFlagsHomologacao>;
  catalogo?: FeatureFlagMetadata[];
  error?: string;
}

export default function FeatureFlagsHomologacaoPanel() {
  const [carregando, setCarregando] = useState(true);
  const [salvandoChave, setSalvandoChave] = useState<string | null>(null);
  const [disparando19h, setDisparando19h] = useState(false);
  const [porEmpresa, setPorEmpresa] = useState<
    Record<TenantSlug, FeatureFlagsHomologacao>
  >({
    jhoston: {
      FF_RESUMO_DIARIO_19H: false,
      FF_EXTRATO_COLABORADOR_LINK: false,
    },
    intermack: {
      FF_RESUMO_DIARIO_19H: false,
      FF_EXTRATO_COLABORADOR_LINK: false,
    },
  });
  const [catalogo, setCatalogo] = useState<FeatureFlagMetadata[]>([]);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/feature-flags?all=1', {
        cache: 'no-store',
      });
      const data = (await res.json()) as FeatureFlagsApiResponse;
      if (data.porEmpresa) setPorEmpresa(data.porEmpresa);
      if (data.catalogo) setCatalogo(data.catalogo);
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Não foi possível carregar as Feature Flags de homologação.',
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternarFlag(
    tenantSlug: TenantSlug,
    flagKey: FeatureFlagKey,
    novoValor: boolean
  ) {
    const lockId = `${tenantSlug}:${flagKey}`;
    setSalvandoChave(lockId);
    setFeedback(null);
    try {
      const res = await fetch('/api/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          flags: { [flagKey]: novoValor },
          atualizadoPor: 'Super Usuário (/setup)',
        }),
      });
      const data = (await res.json()) as FeatureFlagsApiResponse & {
        message?: string;
      };
      if (!res.ok) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Erro ao atualizar flag de homologação.',
        });
        return;
      }
      if (data.porEmpresa) setPorEmpresa(data.porEmpresa);
      setFeedback({
        tipo: 'sucesso',
        texto: `${flagKey} ${novoValor ? 'ATIVADA (EM HOMOLOGAÇÃO)' : 'DESATIVADA'} para ${tenantSlug === 'jhoston' ? 'Jhoston' : 'Intermack'}.`,
      });
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Falha de conexão ao salvar Feature Flag.',
      });
    } finally {
      setSalvandoChave(null);
    }
  }

  async function testarDisparoResumo19h() {
    setDisparando19h(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cron/resumo-diario-19h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        obrasProcessadas?: number;
        reason?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto:
            data.reason ||
            data.error ||
            'Resumo 19h bloqueado pela Feature Flag ou sem obras hoje.',
        });
        return;
      }
      setFeedback({
        tipo: 'sucesso',
        texto: `Resumo Diário 19h (EM HOMOLOGAÇÃO) processado para ${data.obrasProcessadas || 0} obra(s) da empresa ativa.`,
      });
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Erro ao testar disparo do Resumo Diário 19h.',
      });
    } finally {
      setDisparando19h(false);
    }
  }

  const empresas: ReadonlyArray<{ slug: TenantSlug; nome: string; cor: string }> = [
    { slug: 'jhoston', nome: 'Jhoston (Diarista)', cor: 'emerald' },
    { slug: 'intermack', nome: 'Intermack (Empreita)', cor: 'indigo' },
  ];

  const algumaResumo19hAtiva =
    porEmpresa.jhoston.FF_RESUMO_DIARIO_19H ||
    porEmpresa.intermack.FF_RESUMO_DIARIO_19H;

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase tracking-wider">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Governança de Homologação (Super Usuário)</span>
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-950">
            Feature Flags por Empresa (Jhoston &amp; Intermack)
          </h2>
          <p className="text-xs text-slate-500">
            Ative ou desative recursos em homologação independentemente por empresa sem novo deploy. Quando desligada, a funcionalidade fica 100% oculta da UI e bloqueada no backend.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {algumaResumo19hAtiva && (
            <button
              type="button"
              onClick={() => void testarDisparoResumo19h()}
              disabled={disparando19h}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {disparando19h ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Testar Resumo 19h</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void carregar()}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Recarregar Feature Flags"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.texto}</span>
        </div>
      )}

      {carregando ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <div className="space-y-3">
          {catalogo.map((item) => (
            <div
              key={item.key}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-slate-900 text-emerald-300">
                    {item.key}
                  </code>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    {item.statusLabel}
                  </span>
                </div>
                <h3 className="text-sm font-black text-slate-950">
                  {item.titulo}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {item.descricao}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {empresas.map((emp) => {
                  const ativo = porEmpresa[emp.slug][item.key];
                  const lockId = `${emp.slug}:${item.key}`;
                  const busy = salvandoChave === lockId;
                  return (
                    <button
                      key={emp.slug}
                      type="button"
                      disabled={busy}
                      onClick={() => void alternarFlag(emp.slug, item.key, !ativo)}
                      className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 transition-all ${
                        ativo
                          ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          ativo ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'
                        }`}
                      />
                      <span>{emp.nome}</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          ativo
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {busy ? '...' : ativo ? 'ATIVA' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>
          Isolamento estrito por <code className="text-slate-600">tenant_id</code> — alterações refletem imediatamente em APIs, cron 19h e UI.
        </span>
      </div>
    </section>
  );
}
