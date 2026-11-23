'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type {
  FeatureFlagKey,
  FeatureFlagMetadata,
  FeatureFlagsAuditoriaTenant,
  FeatureFlagsHomologacao,
} from '@/services/featureFlagsStorage';
import type { TenantSlug } from '@/lib/tenant';

interface FeatureFlagsApiResponse {
  success?: boolean;
  porEmpresa?: Record<TenantSlug, FeatureFlagsHomologacao>;
  auditoriaPorEmpresa?: Record<TenantSlug, FeatureFlagsAuditoriaTenant>;
  catalogo?: FeatureFlagMetadata[];
  error?: string;
}

interface FeatureFlagsHomologacaoPanelProps {
  usuarioAtual?: string;
}

function formatarDataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return 'Sem alterações registradas';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function FeatureFlagsHomologacaoPanel({
  usuarioAtual = 'Patrícia Grubel',
}: FeatureFlagsHomologacaoPanelProps) {
  const [carregando, setCarregando] = useState(true);
  const [salvandoChave, setSalvandoChave] = useState<string | null>(null);
  const [disparandoEmpresa, setDisparandoEmpresa] = useState<TenantSlug | null>(
    null
  );
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
  const [auditoriaPorEmpresa, setAuditoriaPorEmpresa] = useState<
    Record<TenantSlug, FeatureFlagsAuditoriaTenant>
  >({
    jhoston: { atualizadoPor: null, atualizadoEm: null },
    intermack: { atualizadoPor: null, atualizadoEm: null },
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
      if (!res.ok) {
        setFeedback({
          tipo: 'erro',
          texto:
            data.error ||
            'Não foi possível carregar as Feature Flags de homologação.',
        });
        return;
      }
      if (data.porEmpresa) setPorEmpresa(data.porEmpresa);
      if (data.auditoriaPorEmpresa) {
        setAuditoriaPorEmpresa(data.auditoriaPorEmpresa);
      }
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
          atualizadoPor: `${usuarioAtual} (/config-geral)`,
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
      if (data.auditoriaPorEmpresa) {
        setAuditoriaPorEmpresa(data.auditoriaPorEmpresa);
      }
      const nomeEmp = tenantSlug === 'jhoston' ? 'Jhoston' : 'Intermack';
      setFeedback({
        tipo: 'sucesso',
        texto: `${flagKey} ${novoValor ? 'ATIVADA (EM HOMOLOGAÇÃO)' : 'DESATIVADA (100% OCULTA/BLOQUEADA)'} para ${nomeEmp}.`,
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

  async function testarDisparoResumo19h(tenantSlug: TenantSlug) {
    setDisparandoEmpresa(tenantSlug);
    setFeedback(null);
    try {
      const res = await fetch('/api/cron/resumo-diario-19h', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({ force: true, tenantSlug }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        obrasProcessadas?: number;
        reason?: string;
        error?: string;
      };
      const nomeEmp = tenantSlug === 'jhoston' ? 'Jhoston' : 'Intermack';
      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto:
            data.reason ||
            data.error ||
            `Resumo 19h bloqueado pela Feature Flag ou sem obras hoje em ${nomeEmp}.`,
        });
        return;
      }
      setFeedback({
        tipo: 'sucesso',
        texto: `Resumo Diário 19h (EM HOMOLOGAÇÃO) processado para ${data.obrasProcessadas || 0} obra(s) da ${nomeEmp}.`,
      });
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Erro ao testar disparo do Resumo Diário 19h.',
      });
    } finally {
      setDisparandoEmpresa(null);
    }
  }

  const empresas: ReadonlyArray<{
    slug: TenantSlug;
    nome: string;
    perfil: string;
  }> = [
    { slug: 'jhoston', nome: 'Jhoston', perfil: 'Diarista' },
    { slug: 'intermack', nome: 'Intermack', perfil: 'Empreita' },
  ];

  const contarAtivas = (slug: TenantSlug): number =>
    catalogo.filter((item) => porEmpresa[slug][item.key]).length;

  return (
    <section
      id="central-homologacao-flags"
      className="bg-white rounded-3xl border border-amber-200/90 shadow-sm p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wider">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Ponto Único de Homologação &amp; Implantação</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
              Exclusivo Patrícia &amp; Daniel
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-950">
            Chaves de Liberação (Feature Flags) por Empresa
          </h2>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            Controle centralizado de todas as funcionalidades em fase de{' '}
            <strong>homologação ou implantação</strong>. Quando ativada para uma
            empresa, o recurso exibe o selo <strong>EM HOMOLOGAÇÃO</strong>;
            quando desligada, fica <strong>100% oculto</strong> na UI e
            bloqueado nas APIs e agendamentos daquela empresa.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 text-[11px] font-bold bg-slate-50 border border-slate-200 px-3 py-2 rounded-2xl tabular-nums">
            <span className="text-emerald-700">
              Jhoston: {contarAtivas('jhoston')}/{catalogo.length}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-indigo-700">
              Intermack: {contarAtivas('intermack')}/{catalogo.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
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
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {carregando ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <div className="space-y-3">
          {catalogo.map((item) => (
            <div
              key={item.key}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-slate-900 text-emerald-300">
                      {item.key}
                    </code>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      {item.statusLabel}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                      Fase: {item.fase}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-slate-950">
                    {item.titulo}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.descricao}
                  </p>
                  {item.fluxosAfetados && item.fluxosAfetados.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {item.fluxosAfetados.map((fluxo) => (
                        <span
                          key={fluxo}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500"
                        >
                          {fluxo}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {empresas.map((emp) => {
                    const ativo = porEmpresa[emp.slug][item.key];
                    const lockId = `${emp.slug}:${item.key}`;
                    const busy = salvandoChave === lockId;
                    return (
                      <button
                        key={emp.slug}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void alternarFlag(emp.slug, item.key, !ativo)
                        }
                        className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 transition-all ${
                          ativo
                            ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            ativo
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-slate-300'
                          }`}
                        />
                        <span>
                          {emp.nome}{' '}
                          <span className="text-[10px] font-semibold opacity-70">
                            ({emp.perfil})
                          </span>
                        </span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            ativo
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {busy ? '...' : ativo ? 'EM HOMOLOGAÇÃO' : 'OFF'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {item.key === 'FF_RESUMO_DIARIO_19H' &&
                (porEmpresa.jhoston.FF_RESUMO_DIARIO_19H ||
                  porEmpresa.intermack.FF_RESUMO_DIARIO_19H) && (
                  <div className="pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-amber-900">
                      Disparo manual de teste (isolado por empresa ativa):
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {empresas.map((emp) => {
                        if (!porEmpresa[emp.slug].FF_RESUMO_DIARIO_19H) {
                          return null;
                        }
                        const rodando = disparandoEmpresa === emp.slug;
                        return (
                          <button
                            key={emp.slug}
                            type="button"
                            onClick={() => void testarDisparoResumo19h(emp.slug)}
                            disabled={disparandoEmpresa !== null}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                          >
                            {rodando ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>Testar 19h • {emp.nome}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            Isolamento estrito por{' '}
            <code className="text-slate-700">tenant_id</code> — alterações
            refletem imediatamente em UI, APIs, Webhook e Cron.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Jhoston: {formatarDataHoraCurta(auditoriaPorEmpresa.jhoston.atualizadoEm)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Intermack:{' '}
            {formatarDataHoraCurta(auditoriaPorEmpresa.intermack.atualizadoEm)}
          </span>
        </div>
      </div>
    </section>
  );
}
