'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Activity,
  FileSearch,
  Check,
  TrendingUp,
  TrendingDown,
  MessageSquare,
} from 'lucide-react';
import type {
  AnomaliaAuditoria,
  CruzamentoLoteAuditoria,
  RelatorioAuditoriaInterna,
  SeveridadeAnomalia,
} from '@/services/auditoriaEngine';

interface AuditoriaApiResponse extends RelatorioAuditoriaInterna {
  success?: boolean;
  tenant?: { id: string; slug: string; nome: string };
  periodo?: string;
  error?: string;
}

export default function AuditoriaPage() {
  const [periodo, setPeriodo] = useState<'7d' | '15d' | '30d' | 'todos'>('15d');
  const [loading, setLoading] = useState<boolean>(true);
  const [tenantNome, setTenantNome] = useState<string>('Jhoston');
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [dados, setDados] = useState<RelatorioAuditoriaInterna | null>(null);
  const [filtroSev, setFiltroSev] = useState<'TODAS' | SeveridadeAnomalia>('TODAS');
  const [aplicandoId, setAplicandoId] = useState<string | null>(null);
  const [gerandoParecerIa, setGerandoParecerIa] = useState<boolean>(false);
  const [parecerIa, setParecerIa] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  const carregarAuditoria = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auditoria?periodo=${periodo}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as AuditoriaApiResponse;
      if (res.ok && data.success) {
        setTenantNome(data.tenant?.nome || 'Jhoston');
        setDados({
          anomalias: data.anomalias || [],
          simulacao: data.simulacao,
          cruzamentoLotes: data.cruzamentoLotes || [],
          totalLancamentosAnalisados: data.totalLancamentosAnalisados || 0,
          totalLotesAnalisados: data.totalLotesAnalisados || 0,
        });
      }
    } catch (err) {
      console.error('Erro ao carregar auditoria:', err);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const raw = userCookie.split('=')[1] || '';
      try {
        setUsuarioAtual(decodeURIComponent(decodeURIComponent(raw)).trim());
      } catch {
        setUsuarioAtual(decodeURIComponent(raw).replace(/%20/g, ' ').trim());
      }
    }
    void carregarAuditoria();
  }, [carregarAuditoria]);

  async function handleAprovarCorrecaoUmClique(anomalia: AnomaliaAuditoria) {
    if (!anomalia.acaoCorretiva.podeAprovarUmClique) return;
    setAplicandoId(anomalia.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'aplicar-correcao',
          tipoAcao: anomalia.acaoCorretiva.tipo,
          lancamentoId: anomalia.acaoCorretiva.lancamentoId,
          novoNome: anomalia.acaoCorretiva.novoNome,
          novoValor: anomalia.acaoCorretiva.novoValor,
          motivo: `Auditoria Interna (${anomalia.titulo}) aprovada por ${usuarioAtual}`,
          executadoPor: usuarioAtual,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao aplicar correção.',
        });
        return;
      }

      setFeedback({
        tipo: 'sucesso',
        texto: `Correção aprovada para ${anomalia.trabalhadorCanonico}: ${anomalia.antes.valor} → ${anomalia.depoisSugerido.valor}`,
      });
      await carregarAuditoria();
    } finally {
      setAplicandoId(null);
    }
  }

  async function handleGerarParecerIa() {
    setGerandoParecerIa(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analisar-ia', periodo }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        parecerIa?: string;
        error?: string;
      };
      if (res.ok && data.parecerIa) {
        setParecerIa(data.parecerIa);
      } else {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Não foi possível gerar o parecer IA.',
        });
      }
    } finally {
      setGerandoParecerIa(false);
    }
  }

  const anomaliasFiltradas = (dados?.anomalias || []).filter((a) =>
    filtroSev === 'TODAS' ? true : a.severidade === filtroSev
  );

  const sim = dados?.simulacao;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
              {tenantNome} • Governança & Compliance Pré-Fechamento
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 mt-1">
            Auditoria Interna com Correção Assistida por IA
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Cruzamento Banco × Logs do WhatsApp com diff <strong>Antes × Depois</strong>, aprovação em 1 clique e simulação de impacto financeiro pré-fechamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-200/80 p-1 rounded-2xl gap-1">
            {(
              [
                { id: '7d', label: '7 dias' },
                { id: '15d', label: '15 dias' },
                { id: '30d', label: '30 dias' },
                { id: 'todos', label: 'Tudo' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriodo(opt.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  periodo === opt.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleGerarParecerIa()}
            disabled={gerandoParecerIa || loading}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {gerandoParecerIa ? 'Analisando com IA...' : 'Diagnóstico Pericial IA'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void carregarAuditoria()}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl shadow-sm"
            title="Reexecutar auditoria em tempo real"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.texto}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Parecer IA Gemini */}
      {parecerIa && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-indigo-950 to-slate-950 text-white space-y-2 shadow-lg border border-indigo-800/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black text-indigo-300 uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Parecer Pericial Pré-Fechamento (IA)</span>
            </div>
            <button
              type="button"
              onClick={() => setParecerIa(null)}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Ocultar
            </button>
          </div>
          <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
            {parecerIa}
          </p>
        </div>
      )}

      {/* Simulador de Impacto Financeiro Pré-Fechamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Saldo Aberto Atual</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-950 tabular-nums">
            R$ {(sim?.saldoAbertoAtual || 0).toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400">
            {dados?.totalLancamentosAnalisados || 0} lançamento(s) auditado(s)
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Impacto das Correções (Δ)</span>
            {(sim?.impactoCorrecoesDelta || 0) >= 0 ? (
              <TrendingUp className="w-4 h-4 text-amber-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-emerald-600" />
            )}
          </div>
          <div
            className={`text-2xl font-black tabular-nums ${
              (sim?.impactoCorrecoesDelta || 0) === 0
                ? 'text-slate-600'
                : (sim?.impactoCorrecoesDelta || 0) > 0
                  ? 'text-amber-600'
                  : 'text-emerald-600'
            }`}
          >
            {(sim?.impactoCorrecoesDelta || 0) >= 0 ? '+' : ''}R${' '}
            {(sim?.impactoCorrecoesDelta || 0).toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400">
            Simulação antes de aprovar os diffs
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Projetado Pós-Auditoria</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 tabular-nums">
            R$ {(sim?.saldoProjetadoPosCorrecoes || 0).toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400">
            Valor líquido estimado para o PIX
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Anomalias em Tempo Real</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-950 tabular-nums">
            {sim?.totalAnomalias || 0}
          </div>
          <p className="text-[11px] text-slate-500">
            <strong className="text-rose-600">{sim?.anomaliasAlta || 0} críticas</strong> •{' '}
            <strong className="text-amber-600">{sim?.anomaliasMedia || 0} médias</strong> •{' '}
            {sim?.anomaliasInfo || 0} info
          </p>
        </div>
      </div>

      {/* Lista de Anomalias com Diff Antes x Depois e Aprovação em 1 Clique */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-amber-400" />
              <span>Anomalias Detectadas & Diff Antes × Depois</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Nenhuma alteração é aplicada sem sua aprovação explícita (Human-in-the-Loop).
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {(['TODAS', 'ALTA', 'MEDIA', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setFiltroSev(sev)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  filtroSev === sev
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-amber-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500">
              Cruzando lançamentos financeiros, regras de diária e logs do WhatsApp...
            </p>
          </div>
        ) : anomaliasFiltradas.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-base font-black text-slate-900">
              Nenhuma anomalia encontrada neste filtro!
            </h3>
            <p className="text-xs text-slate-500">
              Todos os lançamentos do período respeitam as regras de diária, aliases canônicos, teto diário e comprovantes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {anomaliasFiltradas.map((anom) => (
              <div key={anom.id} className="p-6 space-y-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          anom.severidade === 'ALTA'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : anom.severidade === 'MEDIA'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                      >
                        {anom.severidade}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {anom.trabalhadorCanonico} • {anom.obraNome} • {anom.dataReferencia}
                      </span>
                      {anom.impactoFinanceiroDelta !== 0 && (
                        <span
                          className={`text-[11px] font-black tabular-nums px-2 py-0.5 rounded-full ${
                            anom.impactoFinanceiroDelta < 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          Impacto: {anom.impactoFinanceiroDelta > 0 ? '+' : ''}R${' '}
                          {anom.impactoFinanceiroDelta.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-black text-slate-950">{anom.titulo}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {anom.descricao}
                    </p>
                  </div>

                  {anom.acaoCorretiva.podeAprovarUmClique ? (
                    <button
                      type="button"
                      disabled={aplicandoId === anom.id}
                      onClick={() => void handleAprovarCorrecaoUmClique(anom)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50 shrink-0"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>
                        {aplicandoId === anom.id
                          ? 'Aplicando...'
                          : 'Aprovar Correção (1 Clique)'}
                      </span>
                    </button>
                  ) : (
                    <span className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold shrink-0">
                      Revisão Manual Recomendada
                    </span>
                  )}
                </div>

                {/* Diff visual Antes x Depois */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-rose-600">
                      Antes ({anom.antes.campo})
                    </span>
                    <div className="text-xs font-bold text-rose-950 break-words">
                      {anom.antes.valor}
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-400 mx-auto hidden md:block" />

                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-emerald-700">
                      Depois Sugerido ({anom.depoisSugerido.campo})
                    </span>
                    <div className="text-xs font-bold text-emerald-950 break-words">
                      {anom.depoisSugerido.valor}
                    </div>
                  </div>
                </div>

                {anom.loteEvidencia && (
                  <div className="px-3.5 py-2 rounded-xl bg-slate-100 text-[11px] text-slate-600 font-mono truncate">
                    Log WhatsApp: &quot;{anom.loteEvidencia}&quot;
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cruzamento Logs WhatsApp (ponto_lote) x Banco */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-950 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>
                Cruzamento Mensagens WhatsApp × Lançamentos ({dados?.totalLotesAnalisados || 0} lotes)
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Confere cada mensagem recebida dos grupos contra os lançamentos gravados no banco.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
              <tr>
                <th className="p-4">Data</th>
                <th className="p-4">Obra</th>
                <th className="p-4">Remetente</th>
                <th className="p-4">Trecho da Mensagem (WhatsApp)</th>
                <th className="p-4 text-right">Itens DB</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(dados?.cruzamentoLotes || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhum lote do WhatsApp encontrado neste período.
                  </td>
                </tr>
              ) : (
                (dados?.cruzamentoLotes || []).map((lote: CruzamentoLoteAuditoria) => (
                  <tr key={lote.loteId} className="hover:bg-slate-50/70">
                    <td className="p-4 font-bold text-slate-800 whitespace-nowrap">
                      {lote.dataReferencia}
                    </td>
                    <td className="p-4 font-bold text-slate-900">{lote.obraNome}</td>
                    <td className="p-4 text-slate-600">{lote.remetente}</td>
                    <td className="p-4 text-slate-600 max-w-md truncate font-mono text-[11px]">
                      {lote.trechoMensagem || '—'}
                    </td>
                    <td className="p-4 text-right font-bold tabular-nums text-slate-800">
                      {lote.qtdLancamentosVinculados}
                    </td>
                    <td className="p-4 text-right font-black tabular-nums text-slate-900">
                      R$ {lote.valorTotalLote.toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          lote.temDivergencia
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {lote.temDivergencia ? 'Revisar' : lote.statusLote}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
