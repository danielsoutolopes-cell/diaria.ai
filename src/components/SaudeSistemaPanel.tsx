'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
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
  Ghost,
  Copy,
  Wrench,
  Scissors,
  Clock,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  AnomaliaAuditoria,
  CategoriaAnomaliaSaude,
  CruzamentoLoteAuditoria,
  NivelSaudeSistema,
  PilarSaudeSistema,
  RelatorioAuditoriaInterna,
  SeveridadeAnomalia,
} from '@/services/auditoriaEngine';
import {
  OPCOES_CADENCIA_SAUDE,
  type CadenciaSaudeSistema,
  type ConfiguracaoCadenciaSaude,
  type HistoricoLaudoSaudeRecord,
} from '@/services/saudeCadenciaService';

interface AuditoriaApiResponse extends RelatorioAuditoriaInterna {
  success?: boolean;
  tenant?: { id: string; slug: string; nome: string };
  periodo?: string;
  cacheHit?: boolean;
  cadenciaConfig?: ConfiguracaoCadenciaSaude;
  proximaExecucaoIso?: string | null;
  proximaExecucaoFormatada?: string | null;
  ultimoLaudoMeta?: HistoricoLaudoSaudeRecord | null;
  historico?: HistoricoLaudoSaudeRecord[];
  error?: string;
}

interface SaudeSistemaPanelProps {
  /** Quando embutido como aba dentro de /relatorios, usa cabeçalho mais compacto */
  embutidoEmRelatorios?: boolean;
  /** Callback opcional para informar o score geral para badge na aba pai */
  onScoreCarregado?: (info: {
    scoreGeral: number;
    anomaliasAlta: number;
    nivel: NivelSaudeSistema;
  }) => void;
}

function getNivelEstilo(nivel: NivelSaudeSistema): {
  badge: string;
  bar: string;
  ring: string;
  label: string;
} {
  if (nivel === 'EXCELENTE') {
    return {
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      bar: 'bg-emerald-500',
      ring: 'text-emerald-400',
      label: 'Excelente',
    };
  }
  if (nivel === 'SAUDAVEL') {
    return {
      badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      bar: 'bg-sky-500',
      ring: 'text-sky-400',
      label: 'Saudável',
    };
  }
  if (nivel === 'ATENCAO') {
    return {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      bar: 'bg-amber-500',
      ring: 'text-amber-400',
      label: 'Atenção',
    };
  }
  return {
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    bar: 'bg-rose-500',
    ring: 'text-rose-400',
    label: 'Crítico',
  };
}

function getPilarEstilo(pilar: PilarSaudeSistema): {
  pill: string;
  bar: string;
} {
  if (pilar.status === 'OK') {
    return {
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      bar: 'bg-emerald-500',
    };
  }
  if (pilar.status === 'ALERTA') {
    return {
      pill: 'bg-amber-50 text-amber-800 border-amber-200',
      bar: 'bg-amber-500',
    };
  }
  return {
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    bar: 'bg-rose-500',
  };
}

export default function SaudeSistemaPanel({
  embutidoEmRelatorios = false,
  onScoreCarregado,
}: SaudeSistemaPanelProps) {
  const [periodo, setPeriodo] = useState<'7d' | '15d' | '30d' | 'todos'>('15d');
  const [carregandoInicial, setCarregandoInicial] = useState<boolean>(true);
  const [varrendo, setVarrendo] = useState<boolean>(false);
  const [salvandoCadencia, setSalvandoCadencia] = useState<boolean>(false);
  const [tenantNome, setTenantNome] = useState<string>('Jhoston');
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [dados, setDados] = useState<RelatorioAuditoriaInterna | null>(null);
  const [ultimoLaudoMeta, setUltimoLaudoMeta] =
    useState<HistoricoLaudoSaudeRecord | null>(null);
  const [historico, setHistorico] = useState<HistoricoLaudoSaudeRecord[]>([]);
  const [historicoExpandido, setHistoricoExpandido] = useState<boolean>(false);
  const [cadencia, setCadencia] =
    useState<CadenciaSaudeSistema>('SOB_DEMANDA_19H30');
  const [proximaExecucaoFormatada, setProximaExecucaoFormatada] = useState<
    string | null
  >(null);
  const [filtroCat, setFiltroCat] = useState<'TODAS' | CategoriaAnomaliaSaude>('TODAS');
  const [filtroSev, setFiltroSev] = useState<'TODAS' | SeveridadeAnomalia>('TODAS');
  const [aplicandoId, setAplicandoId] = useState<string | null>(null);
  const [aplicandoLote, setAplicandoLote] = useState<boolean>(false);
  const [gerandoParecerIa, setGerandoParecerIa] = useState<boolean>(false);
  const [parecerIa, setParecerIa] = useState<string | null>(null);
  const [motorIa, setMotorIa] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  // Ref estável para evitar recriação de efeito / loop infinito de varredura
  const onScoreCarregadoRef = useRef(onScoreCarregado);
  useEffect(() => {
    onScoreCarregadoRef.current = onScoreCarregado;
  }, [onScoreCarregado]);

  const aplicarRespostaAuditoria = useCallback((data: AuditoriaApiResponse) => {
    setTenantNome(data.tenant?.nome || 'Jhoston');
    const relatorio: RelatorioAuditoriaInterna = {
      anomalias: data.anomalias || [],
      simulacao: data.simulacao,
      cruzamentoLotes: data.cruzamentoLotes || [],
      saudeSistema: data.saudeSistema,
      totalLancamentosAnalisados: data.totalLancamentosAnalisados || 0,
      totalLotesAnalisados: data.totalLotesAnalisados || 0,
    };
    setDados(relatorio);
    if (data.ultimoLaudoMeta !== undefined) {
      setUltimoLaudoMeta(data.ultimoLaudoMeta || null);
    }
    if (Array.isArray(data.historico)) {
      setHistorico(data.historico);
    }
    if (data.cadenciaConfig?.cadencia) {
      setCadencia(data.cadenciaConfig.cadencia);
    }
    if (data.proximaExecucaoFormatada !== undefined) {
      setProximaExecucaoFormatada(data.proximaExecucaoFormatada || null);
    }
    if (onScoreCarregadoRef.current && data.saudeSistema) {
      onScoreCarregadoRef.current({
        scoreGeral: data.saudeSistema.scoreGeral,
        anomaliasAlta: data.simulacao?.anomaliasAlta || 0,
        nivel: data.saudeSistema.nivel,
      });
    }
  }, []);

  // Carga estável do último laudo salvo (ou primeira varredura caso ainda não exista laudo)
  const carregarAuditoria = useCallback(
    async (forcarNovaVarredura = false) => {
      if (forcarNovaVarredura) {
        setVarrendo(true);
      } else {
        setCarregandoInicial((prev) => prev);
      }
      try {
        const url = `/api/auditoria?periodo=${periodo}${forcarNovaVarredura ? '&forcar=1' : ''}`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = (await res.json()) as AuditoriaApiResponse;
        if (res.ok && data.success) {
          aplicarRespostaAuditoria(data);
        } else {
          setFeedback({
            tipo: 'erro',
            texto: data.error || 'Falha ao carregar o relatório de saúde.',
          });
        }
      } catch (err) {
        console.error('Erro ao carregar saúde do sistema:', err);
        setFeedback({
          tipo: 'erro',
          texto: 'Não foi possível conectar ao motor de saúde do sistema.',
        });
      } finally {
        setCarregandoInicial(false);
        setVarrendo(false);
      }
    },
    [periodo, aplicarRespostaAuditoria]
  );

  // Lê usuário logado uma única vez no mount
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
  }, []);

  // Carrega o último laudo salvo apenas quando o período muda (zero polling/loop!)
  useEffect(() => {
    void carregarAuditoria(false);
  }, [carregarAuditoria]);

  async function handleExecutarVarreduraManual() {
    setVarrendo(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'executar-varredura',
          periodo,
          executadoPor: usuarioAtual,
        }),
      });
      const data = (await res.json()) as AuditoriaApiResponse;
      if (res.ok && data.success) {
        aplicarRespostaAuditoria(data);
        setFeedback({
          tipo: 'sucesso',
          texto: `Varredura concluída e salva no histórico (${data.ultimoLaudoMeta?.executadoEmFormatado || 'agora'}) — Score ${data.saudeSistema?.scoreGeral ?? 100}/100.`,
        });
      } else {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao executar varredura manual.',
        });
      }
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Erro de conexão ao executar varredura manual.',
      });
    } finally {
      setVarrendo(false);
    }
  }

  async function handleAlterarCadencia(novaCadencia: CadenciaSaudeSistema) {
    setCadencia(novaCadencia);
    setSalvandoCadencia(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'configurar-cadencia',
          cadencia: novaCadencia,
          executadoPor: usuarioAtual,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        cadenciaConfig?: ConfiguracaoCadenciaSaude;
        proximaExecucaoFormatada?: string | null;
        error?: string;
      };
      if (res.ok && data.success) {
        if (data.cadenciaConfig?.cadencia) {
          setCadencia(data.cadenciaConfig.cadencia);
        }
        setProximaExecucaoFormatada(data.proximaExecucaoFormatada || null);
        setFeedback({
          tipo: 'sucesso',
          texto: data.proximaExecucaoFormatada
            ? `Cadência atualizada! Próxima varredura prevista: ${data.proximaExecucaoFormatada} (BRT).`
            : 'Cadência atualizada para Apenas Manual (Sob Demanda).',
        });
      } else {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao salvar cadência.',
        });
      }
    } finally {
      setSalvandoCadencia(false);
    }
  }

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
          motivo: `Saúde do Sistema (${anomalia.titulo}) aprovada por ${usuarioAtual}`,
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
        texto: `Correção aplicada para ${anomalia.trabalhadorCanonico}: ${anomalia.antes.valor} → ${anomalia.depoisSugerido.valor}`,
      });
      await carregarAuditoria(true);
    } finally {
      setAplicandoId(null);
    }
  }

  async function handleAplicarAjustesSeguros() {
    const seguros = (dados?.anomalias || []).filter(
      (a) =>
        a.acaoCorretiva.podeAprovarUmClique &&
        a.acaoCorretiva.lancamentoId &&
        (a.acaoCorretiva.tipo === 'NORMALIZAR_NOME' ||
          a.acaoCorretiva.tipo === 'PREENCHER_IDEMPOTENCIA')
    );
    if (seguros.length === 0) return;
    const ok = window.confirm(
      `Aplicar ${seguros.length} ajuste(s) seguro(s) (normalização de apelidos e gravação de chaves de idempotência)? Duplicidades e fantasmas continuam exigindo aprovação individual.`
    );
    if (!ok) return;

    setAplicandoLote(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'aplicar-lote-seguro',
          executadoPor: usuarioAtual,
          itensLote: seguros.map((a) => ({
            tipoAcao: a.acaoCorretiva.tipo,
            lancamentoId: a.acaoCorretiva.lancamentoId,
            novoNome: a.acaoCorretiva.novoNome,
          })),
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
          texto: data.error || 'Falha ao aplicar ajustes em lote.',
        });
        return;
      }
      setFeedback({
        tipo: 'sucesso',
        texto: data.message || 'Ajustes seguros aplicados!',
      });
      await carregarAuditoria(true);
    } finally {
      setAplicandoLote(false);
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
        motor?: string;
        parecerIa?: string;
        error?: string;
      };
      if (res.ok && data.parecerIa) {
        setParecerIa(data.parecerIa);
        setMotorIa(data.motor || 'IA');
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

  const anomaliasTodas = dados?.anomalias || [];
  const anomaliasFiltradas = anomaliasTodas.filter((a) => {
    const matchSev = filtroSev === 'TODAS' ? true : a.severidade === filtroSev;
    const matchCat = filtroCat === 'TODAS' ? true : a.categoria === filtroCat;
    return matchSev && matchCat;
  });

  const qtdAjustesSeguros = anomaliasTodas.filter(
    (a) =>
      a.acaoCorretiva.podeAprovarUmClique &&
      (a.acaoCorretiva.tipo === 'NORMALIZAR_NOME' ||
        a.acaoCorretiva.tipo === 'PREENCHER_IDEMPOTENCIA')
  ).length;

  const sim = dados?.simulacao;
  const saude = dados?.saudeSistema;
  const nivelEstilo = getNivelEstilo(saude?.nivel || 'EXCELENTE');

  const countDuplicados = anomaliasTodas.filter(
    (a) => a.categoria === 'DUPLICADOS'
  ).length;
  const countFantasmas = anomaliasTodas.filter(
    (a) => a.categoria === 'FANTASMAS'
  ).length;
  const countRegras = anomaliasTodas.filter(
    (a) => a.categoria === 'REGRAS'
  ).length;
  const countRastreio = anomaliasTodas.filter(
    (a) => a.categoria === 'RASTREABILIDADE'
  ).length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho & Controles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-emerald-700 uppercase tracking-wider">
              {tenantNome} • Saúde do Sistema &amp; Auditoria IA
            </span>
            {saude?.dataCorteFormatada && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold tabular-nums">
                <Scissors className="w-3 h-3 text-slate-500" />
                <span>Corte: até {saude.dataCorteFormatada}</span>
              </span>
            )}
          </div>
          {!embutidoEmRelatorios ? (
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950 mt-1.5">
              Relatório de Saúde do Sistema &amp; Auditoria IA
            </h1>
          ) : (
            <h2 className="text-xl sm:text-2xl font-black text-slate-950 mt-1.5">
              Relatório de Saúde do Sistema &amp; Caça-Fantasmas (IA)
            </h2>
          )}
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Varredura em tempo real de <strong>registros duplicados</strong>,{' '}
            <strong>registros fantasmas/órfãos</strong>, divergências de preço e parecer pericial com IA.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 w-full lg:w-auto">
          <div className="grid grid-cols-4 sm:flex items-center bg-slate-200/80 p-1 rounded-2xl gap-1 w-full sm:w-auto">
            {(
              [
                { id: '7d', label: '7d' },
                { id: '15d', label: '15d' },
                { id: '30d', label: '30d' },
                { id: 'todos', label: 'Tudo' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriodo(opt.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-center ${
                  periodo === opt.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void handleExecutarVarreduraManual()}
              disabled={varrendo}
              className="flex-1 sm:flex-none justify-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-60"
              title="Executar nova varredura agora e salvar laudo no histórico auditável"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${varrendo ? 'animate-spin' : ''}`} />
              <span>{varrendo ? 'Varrendo...' : 'Executar Varredura'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleGerarParecerIa()}
              disabled={gerandoParecerIa || varrendo}
              className="flex-1 sm:flex-none justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {gerandoParecerIa ? 'Analisando IA...' : 'Diagnóstico IA'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Faixa de Estabilidade: Último Laudo Salvo + Cadência Configurável (Sob Demanda + 19:30 padrão) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 font-black text-slate-800">
              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Último laudo:</span>
            </span>
            <span className="font-bold text-slate-900 tabular-nums">
              {ultimoLaudoMeta?.executadoEmFormatado ||
                (carregandoInicial ? 'Carregando...' : 'Ainda não registrado')}
            </span>
            {ultimoLaudoMeta && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                  ultimoLaudoMeta.origem === 'CADENCIA'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {ultimoLaudoMeta.origem === 'CADENCIA' ? 'Cadência' : 'Manual'}
              </span>
            )}
            {varrendo && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                Atualizando...
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 tabular-nums">
            {ultimoLaudoMeta && (
              <span>
                Auditados: <strong className="text-slate-700">{ultimoLaudoMeta.totalLancamentosAuditados}</strong> lançamentos •{' '}
                <strong className="text-slate-700">{ultimoLaudoMeta.totalValesAuditados}</strong> vales •{' '}
                <strong className="text-slate-700">{ultimoLaudoMeta.totalLotesAuditados}</strong> lotes
              </span>
            )}
            <span>
              Próxima cadência:{' '}
              <strong className="text-slate-800">
                {proximaExecucaoFormatada
                  ? `${proximaExecucaoFormatada} (BRT)`
                  : 'Sob demanda apenas'}
              </strong>
            </span>
          </div>
        </div>

        {/* Seletor de Cadência por Tenant */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 shrink-0">
          <label
            htmlFor="saude-cadencia-select"
            className="text-[11px] font-black text-slate-600 uppercase tracking-wider shrink-0"
          >
            Cadência ({tenantNome}):
          </label>
          <select
            id="saude-cadencia-select"
            aria-label="Cadência de varredura de saúde"
            value={cadencia}
            disabled={salvandoCadencia}
            onChange={(e) =>
              void handleAlterarCadencia(e.target.value as CadenciaSaudeSistema)
            }
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none disabled:opacity-60"
          >
            {OPCOES_CADENCIA_SAUDE.map((op) => (
              <option key={op.id} value={op.id}>
                {op.label}
              </option>
            ))}
          </select>
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
            className="text-[11px] opacity-70 hover:opacity-100 shrink-0"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Hero Health Score Card (0-100) — Estável, exibe o último laudo salvo sem piscar */}
      <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-5 sm:p-6 shadow-xl border border-slate-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-700/80 flex flex-col items-center justify-center shrink-0 shadow-inner">
              <span
                className={`text-3xl font-black tabular-nums leading-none ${nivelEstilo.ring}`}
              >
                {carregandoInicial && !dados ? '—' : saude?.scoreGeral ?? 100}
              </span>
              <span className="text-[10px] font-bold text-slate-400 mt-1">
                de 100
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Índice de Saúde do Banco
                </span>
                <span
                  className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${nivelEstilo.badge}`}
                >
                  {carregandoInicial && !dados ? 'Carregando...' : nivelEstilo.label}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white">
                {carregandoInicial && !dados
                  ? 'Carregando último laudo auditado...'
                  : (saude?.duplicadosDetectados || 0) === 0 &&
                      (saude?.fantasmasDetectados || 0) === 0 &&
                      (sim?.anomaliasAlta || 0) === 0
                    ? 'Integridade blindada — zero duplicados e zero fantasmas!'
                    : `${sim?.totalAnomalias || 0} alerta(s) encontrado(s) (${sim?.anomaliasAlta || 0} crítico(s))`}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 tabular-nums">
                {dados?.totalLancamentosAnalisados || 0} lançamento(s) e{' '}
                {dados?.totalLotesAnalisados || 0} lote(s) WhatsApp auditados sob isolamento estrito de tenant.
              </p>
            </div>
          </div>

          {qtdAjustesSeguros > 0 && (
            <button
              type="button"
              disabled={aplicandoLote}
              onClick={() => void handleAplicarAjustesSeguros()}
              className="w-full md:w-auto justify-center px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50 shrink-0"
            >
              <Wrench className="w-4 h-4 shrink-0" />
              <span>
                {aplicandoLote
                  ? 'Aplicando...'
                  : `Corrigir ${qtdAjustesSeguros} Ajuste(s) Seguro(s)`}
              </span>
            </button>
          )}
        </div>

        {/* 4 KPIs Compactos (2x2 no celular em pé) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Duplicados</span>
              <Copy className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            </div>
            <div
              className={`text-xl sm:text-2xl font-black tabular-nums ${
                (saude?.duplicadosDetectados || 0) > 0
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {saude?.duplicadosDetectados ?? 0}
            </div>
            <p className="text-[10px] text-slate-400">
              Diárias + Vales ({saude?.cadastrosDuplicadosDetectados ?? 0} perfis)
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Fantasmas</span>
              <Ghost className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            </div>
            <div
              className={`text-xl sm:text-2xl font-black tabular-nums ${
                (saude?.fantasmasDetectados || 0) > 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {saude?.fantasmasDetectados ?? 0}
            </div>
            <p className="text-[10px] text-slate-400">
              Órfãos, datas anômalas e lotes vazios
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Idempotência</span>
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-sky-300 tabular-nums">
              {saude?.coberturaIdempotenciaPct ?? 100}%
            </div>
            <p className="text-[10px] text-slate-400">
              PIX equipe: {saude?.coberturaPixEquipePct ?? 100}%
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Impacto (Δ)</span>
              {(sim?.impactoCorrecoesDelta || 0) < 0 ? (
                <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
            </div>
            <div
              className={`text-xl sm:text-2xl font-black tabular-nums ${
                (sim?.impactoCorrecoesDelta || 0) === 0
                  ? 'text-slate-200'
                  : (sim?.impactoCorrecoesDelta || 0) < 0
                    ? 'text-emerald-400'
                    : 'text-amber-400'
              }`}
            >
              {(sim?.impactoCorrecoesDelta || 0) >= 0 ? '+' : ''}R${' '}
              {(sim?.impactoCorrecoesDelta || 0).toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-400 tabular-nums">
              Projetado: R$ {(sim?.saldoProjetadoPosCorrecoes || 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Parecer Pericial da IA (Gemini 2.5 Flash) */}
      {parecerIa && (
        <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white border border-indigo-700/50 shadow-lg space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-300">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Diagnóstico Pericial IA ({motorIa || 'Gemini'})</span>
            </div>
            <button
              type="button"
              onClick={() => setParecerIa(null)}
              className="text-[11px] font-bold text-slate-400 hover:text-white"
            >
              Ocultar
            </button>
          </div>
          <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
            {parecerIa}
          </p>
        </div>
      )}

      {/* 6 Pilares de Saúde do Sistema */}
      {saude && saude.pilares.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {saude.pilares.map((pilar) => {
            const est = getPilarEstilo(pilar);
            return (
              <div
                key={pilar.id}
                className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-black text-slate-900 leading-snug">
                    {pilar.titulo}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 tabular-nums ${est.pill}`}
                  >
                    {pilar.nota}/100
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${est.bar}`}
                    style={{ width: `${Math.max(4, pilar.nota)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {pilar.resumo}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista de Anomalias: Duplicados, Fantasmas & Diff Antes x Depois */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 bg-slate-900 text-white space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-sm sm:text-base font-black">
                Anomalias Detectadas &amp; Diff Antes × Depois
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'TODAS', label: `Sev: Todas` },
                  { id: 'ALTA', label: `Crítica (${sim?.anomaliasAlta || 0})` },
                  { id: 'MEDIA', label: `Média (${sim?.anomaliasMedia || 0})` },
                  { id: 'INFO', label: `Info (${sim?.anomaliasInfo || 0})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroSev(f.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
                    filtroSev === f.id
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtros de Categoria (Duplicados, Fantasmas, Regras, Rastreabilidade) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800">
            {(
              [
                { id: 'TODAS', label: `Todas (${anomaliasTodas.length})` },
                { id: 'DUPLICADOS', label: `Duplicados (${countDuplicados})` },
                { id: 'FANTASMAS', label: `Fantasmas (${countFantasmas})` },
                { id: 'REGRAS', label: `Preços & Regras (${countRegras})` },
                {
                  id: 'RASTREABILIDADE',
                  label: `Rastreio & PIX (${countRastreio})`,
                },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFiltroCat(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  filtroCat === cat.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {carregandoInicial && !dados ? (
          <div className="p-4 sm:p-6 space-y-3 animate-pulse">
            <div className="h-20 bg-slate-100 rounded-2xl" />
            <div className="h-20 bg-slate-100 rounded-2xl" />
          </div>
        ) : anomaliasFiltradas.length === 0 ? (
          <div className="p-8 sm:p-10 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-black text-slate-900">
              Nenhuma anomalia encontrada neste filtro!
            </p>
            <p className="text-xs text-slate-500">
              Nenhum registro duplicado, fantasma ou divergente pendente para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {anomaliasFiltradas.map((anom) => (
              <div
                key={anom.id}
                className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        anom.severidade === 'ALTA'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : anom.severidade === 'MEDIA'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}
                    >
                      {anom.severidade}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {anom.tipo.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-black text-slate-950">
                      {anom.trabalhadorCanonico}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      • {anom.obraNome} • {anom.dataReferencia}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-900">{anom.titulo}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {anom.descricao}
                  </p>

                  {/* Diff Visual Antes x Depois */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 pt-1 text-[11px]">
                    <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
                      <span className="font-black uppercase text-[9px] text-rose-600 block">
                        Antes ({anom.antes.campo})
                      </span>
                      <span className="font-mono font-bold break-words">
                        {anom.antes.valor}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
                    <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                      <span className="font-black uppercase text-[9px] text-emerald-600 block">
                        Depois Sugerido ({anom.depoisSugerido.campo})
                      </span>
                      <span className="font-mono font-bold break-words">
                        {anom.depoisSugerido.valor}
                      </span>
                    </div>
                  </div>

                  {anom.loteEvidencia && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl flex items-start gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <span className="italic break-words">
                        Evidência: &quot;{anom.loteEvidencia}&quot;
                      </span>
                    </div>
                  )}
                </div>

                {/* Ação Human-in-the-Loop em 1 Clique */}
                <div className="flex flex-col items-stretch lg:items-end gap-1.5 shrink-0">
                  {anom.acaoCorretiva.podeAprovarUmClique ? (
                    <button
                      type="button"
                      disabled={aplicandoId === anom.id}
                      onClick={() => void handleAprovarCorrecaoUmClique(anom)}
                      className={`w-full lg:w-auto justify-center px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50 ${
                        anom.acaoCorretiva.tipo === 'DESCARTAR_DUPLICIDADE'
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {aplicandoId === anom.id
                          ? 'Aplicando...'
                          : anom.acaoCorretiva.tipo === 'DESCARTAR_DUPLICIDADE'
                            ? 'Descartar (Soft Delete)'
                            : 'Aprovar em 1 Clique'}
                      </span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Revisão Manual</span>
                    </span>
                  )}

                  {anom.impactoFinanceiroDelta !== 0 && (
                    <span className="text-[11px] font-black text-slate-500 tabular-nums text-center lg:text-right">
                      Impacto: {anom.impactoFinanceiroDelta > 0 ? '+' : ''}R${' '}
                      {anom.impactoFinanceiroDelta.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cruzamento Mensagens WhatsApp x Banco (Caça-Lotes Fantasmas) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-slate-700 shrink-0" />
            <h3 className="text-xs sm:text-sm font-black text-slate-950">
              Cruzamento WhatsApp × Banco ({dados?.cruzamentoLotes.length || 0} lotes)
            </h3>
          </div>
          {(saude?.lotesFantasmasDetectados || 0) > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black tabular-nums">
              {saude?.lotesFantasmasDetectados} lote(s) fantasma(s)
            </span>
          )}
        </div>

        {/* Mobile Retrato: Cards Empilhados */}
        <div className="md:hidden divide-y divide-slate-100">
          {(dados?.cruzamentoLotes || []).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Nenhum lote do WhatsApp encontrado no período.
            </div>
          ) : (
            (dados?.cruzamentoLotes || []).map((lote: CruzamentoLoteAuditoria) => (
              <div key={`mob-${lote.loteId}`} className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 tabular-nums">
                    {lote.dataReferencia} • {lote.obraNome}
                  </span>
                  {lote.isFantasma ? (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black">
                      Fantasma (0 itens)
                    </span>
                  ) : lote.temDivergencia ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black">
                      Revisar
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black">
                      Íntegro
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2">
                  {lote.trechoMensagem || '—'}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-600 tabular-nums">
                  <span>
                    {lote.remetente} • {lote.qtdLancamentosVinculados} item(ns)
                  </span>
                  <strong className="text-slate-900">
                    R$ {lote.valorTotalLote.toFixed(2)}
                  </strong>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop: Tabela Completa */}
        <div className="hidden md:block overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3.5">Data</th>
                <th className="p-3.5">Obra</th>
                <th className="p-3.5">Remetente</th>
                <th className="p-3.5">Mensagem WhatsApp</th>
                <th className="p-3.5 text-right">Itens</th>
                <th className="p-3.5 text-right">Total R$</th>
                <th className="p-3.5 text-center">Saúde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(dados?.cruzamentoLotes || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhum lote do WhatsApp encontrado no período.
                  </td>
                </tr>
              ) : (
                (dados?.cruzamentoLotes || []).map((lote: CruzamentoLoteAuditoria) => (
                  <tr key={lote.loteId} className="hover:bg-slate-50/70">
                    <td className="p-3.5 font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                      {lote.dataReferencia}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {lote.obraNome}
                    </td>
                    <td className="p-3.5 text-slate-600 whitespace-nowrap">
                      {lote.remetente}
                    </td>
                    <td className="p-3.5 text-slate-600 max-w-xs truncate">
                      {lote.trechoMensagem || '—'}
                    </td>
                    <td className="p-3.5 text-right font-bold tabular-nums">
                      {lote.qtdLancamentosVinculados}
                    </td>
                    <td className="p-3.5 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                      R$ {lote.valorTotalLote.toFixed(2)}
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      {lote.isFantasma ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black">
                          Lote Fantasma
                        </span>
                      ) : lote.temDivergencia ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black">
                          Revisar
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black">
                          Íntegro
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Histórico Auditável de Laudos Salvos (Manual & Cadência) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoricoExpandido((prev) => !prev)}
          className="w-full p-4 sm:p-5 bg-slate-50/90 hover:bg-slate-100/80 transition-colors flex flex-wrap items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-slate-600 shrink-0" />
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Histórico Auditável de Laudos ({historico.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Registro persistido por empresa ({tenantNome}) de varreduras manuais e automáticas — visível mesmo sem manter a aba aberta.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            {historicoExpandido ? (
              <>
                Recolher <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Ver Histórico <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </span>
        </button>

        {historicoExpandido && (
          <div className="border-t border-slate-200 overflow-x-auto">
            {historico.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Nenhuma varredura registrada no histórico ainda. Clique em{' '}
                <strong className="text-slate-700">Executar Varredura</strong> para gerar o primeiro laudo auditável.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Data / Hora (BRT)</th>
                    <th className="p-3.5">Origem</th>
                    <th className="p-3.5">Executado por</th>
                    <th className="p-3.5">Período</th>
                    <th className="p-3.5 text-right">Auditados</th>
                    <th className="p-3.5 text-right">Dupl. / Fant.</th>
                    <th className="p-3.5 text-right">Críticos</th>
                    <th className="p-3.5 text-center">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historico.map((item: HistoricoLaudoSaudeRecord) => {
                    const estiloItem = getNivelEstilo(item.nivel);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="p-3.5 font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                          {item.executadoEmFormatado}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          {item.origem === 'CADENCIA' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black uppercase">
                              <Clock className="w-3 h-3" /> Cadência
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black uppercase">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-600 whitespace-nowrap">
                          {item.executadoPor}
                        </td>
                        <td className="p-3.5 text-slate-600 uppercase font-bold whitespace-nowrap">
                          {item.periodo}
                        </td>
                        <td className="p-3.5 text-right text-slate-700 tabular-nums whitespace-nowrap">
                          <span className="font-bold">{item.totalLancamentosAuditados}</span> lanç. ·{' '}
                          <span className="font-bold">{item.totalValesAuditados}</span> vales ·{' '}
                          <span className="font-bold">{item.totalLotesAuditados}</span> lotes
                        </td>
                        <td className="p-3.5 text-right tabular-nums whitespace-nowrap">
                          <span className="font-bold text-slate-800">{item.duplicadosDetectados}</span>
                          {' / '}
                          <span className="font-bold text-slate-800">{item.fantasmasDetectados}</span>
                        </td>
                        <td className="p-3.5 text-right tabular-nums whitespace-nowrap">
                          <span
                            className={`font-black ${
                              item.anomaliasAlta > 0 ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {item.anomaliasAlta}
                          </span>
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-black tabular-nums ${
                              item.nivel === 'EXCELENTE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : item.nivel === 'SAUDAVEL'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : item.nivel === 'ATENCAO'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                            title={estiloItem.label}
                          >
                            {item.scoreGeral}/100
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
