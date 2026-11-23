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
  FeatureFlagEstado,
  FeatureFlagKey,
  FeatureFlagMetadata,
  FeatureFlagsAuditoriaTenant,
  FeatureFlagsEstados,
  FeatureFlagsHomologacao,
} from '@/services/featureFlagsStorage';
import type { TenantSlug } from '@/lib/tenant';

interface FeatureFlagsApiResponse {
  success?: boolean;
  porEmpresa?: Record<TenantSlug, FeatureFlagsHomologacao>;
  estadosPorEmpresa?: Record<TenantSlug, FeatureFlagsEstados>;
  auditoriaPorEmpresa?: Record<TenantSlug, FeatureFlagsAuditoriaTenant>;
  catalogo?: FeatureFlagMetadata[];
  error?: string;
}

function proximoEstadoFlag(atual: FeatureFlagEstado): FeatureFlagEstado {
  if (atual === 'OFF') return 'HOMOLOGACAO';
  if (atual === 'HOMOLOGACAO') return 'ATIVO';
  return 'OFF';
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
  const [contatosPwa, setContatosPwa] = useState<
    Array<{ id: string; nome: string; telefone: string }>
  >([]);
  const [conviteDestino, setConviteDestino] = useState('');
  const [conviteNome, setConviteNome] = useState('Diego');
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [porEmpresa, setPorEmpresa] = useState<
    Record<TenantSlug, FeatureFlagsHomologacao>
  >({
    jhoston: {
      FF_RESUMO_DIARIO_19H: false,
      FF_EXTRATO_COLABORADOR_LINK: false,
      FF_PWA_PONTO_CAMPO: false,
    },
    intermack: {
      FF_RESUMO_DIARIO_19H: false,
      FF_EXTRATO_COLABORADOR_LINK: false,
      FF_PWA_PONTO_CAMPO: false,
    },
  });
  const [estadosPorEmpresa, setEstadosPorEmpresa] = useState<
    Record<TenantSlug, FeatureFlagsEstados>
  >({
    jhoston: {
      FF_RESUMO_DIARIO_19H: 'OFF',
      FF_EXTRATO_COLABORADOR_LINK: 'OFF',
      FF_PWA_PONTO_CAMPO: 'OFF',
    },
    intermack: {
      FF_RESUMO_DIARIO_19H: 'OFF',
      FF_EXTRATO_COLABORADOR_LINK: 'OFF',
      FF_PWA_PONTO_CAMPO: 'OFF',
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
      if (data.estadosPorEmpresa) setEstadosPorEmpresa(data.estadosPorEmpresa);
      if (data.auditoriaPorEmpresa) {
        setAuditoriaPorEmpresa(data.auditoriaPorEmpresa);
      }
      if (data.catalogo) setCatalogo(data.catalogo);

      // Carrega contatos para envio rápido de convite do PWA /ponto
      try {
        const resConv = await fetch('/api/ponto-campo/convite', {
          cache: 'no-store',
        });
        const dConv = (await resConv.json()) as {
          contatos?: Array<{ id: string; nome: string; telefone: string }>;
        };
        if (resConv.ok && Array.isArray(dConv.contatos)) {
          setContatosPwa(dConv.contatos);
          const diego = dConv.contatos.find((c) =>
            c.nome.toLowerCase().includes('diego')
          );
          if (diego && diego.telefone) {
            setConviteDestino((prev) => prev || diego.telefone);
          }
        }
      } catch {
        // opcional
      }
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

  async function alternarEstadoFlag(
    tenantSlug: TenantSlug,
    flagKey: FeatureFlagKey,
    novoEstado: FeatureFlagEstado
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
          estados: { [flagKey]: novoEstado },
          atualizadoPor: `${usuarioAtual} (/config-geral)`,
        }),
      });
      const data = (await res.json()) as FeatureFlagsApiResponse & {
        message?: string;
      };
      if (!res.ok) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Erro ao atualizar flag.',
        });
        return;
      }
      if (data.porEmpresa) setPorEmpresa(data.porEmpresa);
      if (data.estadosPorEmpresa) setEstadosPorEmpresa(data.estadosPorEmpresa);
      if (data.auditoriaPorEmpresa) {
        setAuditoriaPorEmpresa(data.auditoriaPorEmpresa);
      }
      const nomeEmp = tenantSlug === 'jhoston' ? 'Jhoston' : 'Intermack';
      const labelEstado =
        novoEstado === 'ATIVO'
          ? '100% ATIVO (PRODUÇÃO OFICIAL)'
          : novoEstado === 'HOMOLOGACAO'
            ? 'EM HOMOLOGAÇÃO'
            : 'DESATIVADA (OFF)';
      setFeedback({
        tipo: 'sucesso',
        texto: `${flagKey} → ${labelEstado} para ${nomeEmp}.`,
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

  async function enviarConvitePwa() {
    if (!conviteDestino.trim()) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione um contato ou digite o WhatsApp/e-mail para enviar o link.',
      });
      return;
    }
    setEnviandoConvite(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/ponto-campo/convite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destino: conviteDestino.trim(),
          nomeResponsavel: conviteNome.trim() || 'Diego',
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        enviadoWhatsapp?: boolean;
        mensagemPronta?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao enviar convite.',
        });
        return;
      }
      if (data.mensagemPronta && typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(data.mensagemPronta).catch(() => {});
      }
      setFeedback({
        tipo: 'sucesso',
        texto:
          data.message ||
          'Convite enviado! Texto também copiado para a área de transferência.',
      });
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Erro de conexão ao enviar convite do App de Campo.',
      });
    } finally {
      setEnviandoConvite(false);
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
                    const estadoAtual: FeatureFlagEstado =
                      estadosPorEmpresa[emp.slug]?.[item.key] ||
                      (porEmpresa[emp.slug][item.key] ? 'HOMOLOGACAO' : 'OFF');
                    const proximo = proximoEstadoFlag(estadoAtual);
                    const lockId = `${emp.slug}:${item.key}`;
                    const busy = salvandoChave === lockId;
                    const estiloBtn =
                      estadoAtual === 'ATIVO'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm'
                        : estadoAtual === 'HOMOLOGACAO'
                          ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100';
                    const estiloDot =
                      estadoAtual === 'ATIVO'
                        ? 'bg-emerald-500'
                        : estadoAtual === 'HOMOLOGACAO'
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-slate-300';
                    const estiloBadge =
                      estadoAtual === 'ATIVO'
                        ? 'bg-emerald-600 text-white'
                        : estadoAtual === 'HOMOLOGACAO'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-200 text-slate-600';
                    const textoBadge = busy
                      ? '...'
                      : estadoAtual === 'ATIVO'
                        ? '100% ATIVO'
                        : estadoAtual === 'HOMOLOGACAO'
                          ? 'EM HOMOLOGAÇÃO'
                          : 'OFF';
                    return (
                      <button
                        key={emp.slug}
                        type="button"
                        disabled={busy}
                        title="Clique para alternar: OFF → EM HOMOLOGAÇÃO → 100% ATIVO"
                        onClick={() =>
                          void alternarEstadoFlag(emp.slug, item.key, proximo)
                        }
                        className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 transition-all ${estiloBtn}`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${estiloDot}`}
                        />
                        <span>
                          {emp.nome}{' '}
                          <span className="text-[10px] font-semibold opacity-70">
                            ({emp.perfil})
                          </span>
                        </span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${estiloBadge}`}
                        >
                          {textoBadge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {item.key === 'FF_PWA_PONTO_CAMPO' &&
                porEmpresa.jhoston.FF_PWA_PONTO_CAMPO && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-700">
                        Enviar link do PWA (<code>/ponto</code>) + regras de acesso — PIN atual:{' '}
                        <strong className="text-emerald-700">
                          {estadosPorEmpresa.jhoston.FF_PWA_PONTO_CAMPO ===
                          'HOMOLOGACAO'
                            ? '0000 (Homologação)'
                            : '1234 (Produção)'}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value=""
                        onChange={(e) => {
                          const c = contatosPwa.find(
                            (x) => x.id === e.target.value
                          );
                          if (c) {
                            setConviteNome(c.nome);
                            if (c.telefone) setConviteDestino(c.telefone);
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 sm:w-48"
                      >
                        <option value="">Buscar contato...</option>
                        {contatosPwa.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome} {c.telefone ? `(${c.telefone})` : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="WhatsApp (ex: 11999998888) ou e-mail..."
                        value={conviteDestino}
                        onChange={(e) => setConviteDestino(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900"
                      />
                      <button
                        type="button"
                        disabled={enviandoConvite}
                        onClick={() => void enviarConvitePwa()}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {enviandoConvite ? 'Enviando...' : 'Enviar Link + PIN'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

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
