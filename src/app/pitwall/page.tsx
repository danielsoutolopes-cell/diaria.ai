'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Gauge,
  Radio,
  CloudRain,
  Zap,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Flag,
  TrendingUp,
  Trophy,
  Flame,
  Volume2,
} from 'lucide-react';

interface PitWallData {
  obrasAtivas: number;
  lotesPendentes: number;
  totalOperarios: number;
  totalVales: number;
  saldoLiquidoSemana: number;
}

interface ObraCustoPit {
  nomeObra: string;
  totalDiarias: number;
  totalVales: number;
  totalGeral: number;
  qtdTrabalhadores: number;
}

interface LancamentoPit {
  id?: string;
  nome_trabalhador?: string;
  data_referencia?: string;
  valor_monetario?: number;
  observacao?: string;
  tipo_lancamento?: string;
}

interface RelatorioPit {
  totais?: {
    totalGeralDiarias: number;
    totalGeralVales: number;
    totalLiquido: number;
    totalTrabalhadores: number;
    totalObras: number;
  };
  custoPorObra?: ObraCustoPit[];
  lancamentosDetalhados?: LancamentoPit[];
}

const FRASES_TEAM_RADIO = [
  { autor: 'ENGENHEIRO DE PISTA', msg: 'Box, box, box! Patrícia, prepara o PIX que a equipe entrou nos boxes!' },
  { autor: 'PILOTO #01 (GIL)', msg: 'Bono, a chuva chegou em Porto Seguro! Trocando para pneus intermediários!' },
  { autor: 'DIRETORIA (DANIEL)', msg: 'Simply lovely! Obra no ritmo de volta mais rápida — setor roxo!' },
  { autor: 'RACE CONTROL', msg: 'DRS liberado no Cloudflare Workers! Latência de 11ms na reta principal!' },
  { autor: 'JOABSON', msg: 'Bate o cronômetro aí: custo real da obra sob controle total!' },
];

export default function PitWallPage() {
  const [dash, setDash] = useState<PitWallData>({
    obrasAtivas: 0,
    lotesPendentes: 0,
    totalOperarios: 0,
    totalVales: 0,
    saldoLiquidoSemana: 0,
  });
  const [relatorio, setRelatorio] = useState<RelatorioPit | null>(null);
  const [zapStatus, setZapStatus] = useState<string>('CHECKING');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Easter Eggs State
  const [gaugeClicks, setGaugeClicks] = useState<number>(0);
  const [drsAtivo, setDrsAtivo] = useState<boolean>(false);
  const [modoSenna, setModoSenna] = useState<boolean>(false);
  const [safetyCar, setSafetyCar] = useState<boolean>(false);
  const [radioMsg, setRadioMsg] = useState<{ autor: string; msg: string } | null>(null);
  const [mostrarPodio, setMostrarPodio] = useState<boolean>(false);
  const [luzesLargada, setLuzesLargada] = useState<number>(5);

  const carregarTelemetria = useCallback(async () => {
    setLoading(true);
    try {
      const [rDash, rRel, rZap] = await Promise.all([
        fetch('/api/dashboard').then((r) => r.json()).catch(() => ({})),
        fetch('/api/relatorios?periodo=semanal').then((r) => r.json()).catch(() => null),
        fetch('/api/whatsapp/status').then((r) => r.json()).catch(() => ({})),
      ]);

      if (rDash) setDash(rDash as PitWallData);
      if (rRel) setRelatorio(rRel as RelatorioPit);
      const st = (rZap as { status?: string; session?: { status?: string } })?.status ||
        (rZap as { session?: { status?: string } })?.session?.status ||
        'DISCONNECTED';
      setZapStatus(st);
      setUltimaAtualizacao(new Date().toLocaleTimeString('pt-BR'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregarTelemetria();
    const timer = setInterval(() => void carregarTelemetria(), 15000);
    return () => clearInterval(timer);
  }, [carregarTelemetria]);

  // Semáforo de largada F1 (apaga as 5 luzes vermelhas -> Track Green)
  useEffect(() => {
    if (luzesLargada <= 0) return;
    const t = setTimeout(() => setLuzesLargada((n) => Math.max(0, n - 1)), 350);
    return () => clearTimeout(t);
  }, [luzesLargada]);

  // Easter Eggs de teclado: digitar "senna" ou "box"
  useEffect(() => {
    let buffer = '';
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-10);
      if (buffer.endsWith('senna')) {
        setModoSenna((prev) => !prev);
      } else if (buffer.endsWith('box')) {
        const pick = FRASES_TEAM_RADIO[Math.floor(Math.random() * FRASES_TEAM_RADIO.length)];
        setRadioMsg(pick);
        setTimeout(() => setRadioMsg(null), 6500);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleGaugeClick() {
    const next = gaugeClicks + 1;
    setGaugeClicks(next);
    if (next >= 5) {
      setDrsAtivo((prev) => !prev);
      setGaugeClicks(0);
    }
  }

  function dispararTeamRadio() {
    const pick = FRASES_TEAM_RADIO[Math.floor(Math.random() * FRASES_TEAM_RADIO.length)];
    setRadioMsg(pick);
    setTimeout(() => setRadioMsg(null), 6500);
  }

  const totais = relatorio?.totais || {
    totalGeralDiarias: 0,
    totalGeralVales: 0,
    totalLiquido: 0,
    totalTrabalhadores: 0,
    totalObras: 0,
  };
  const obras = relatorio?.custoPorObra || [];
  const lancamentos = (relatorio?.lancamentosDetalhados || []).slice(0, 8);

  const indiceVales =
    totais.totalGeralDiarias > 0
      ? Math.round((totais.totalGeralVales / totais.totalGeralDiarias) * 100)
      : 0;

  const itensChuva = (relatorio?.lancamentosDetalhados || []).filter((l) =>
    (l.observacao || '').toUpperCase().includes('CHUVA')
  );
  const custoChuva = itensChuva.reduce((acc, l) => acc + Number(l.valor_monetario || 0), 0);
  const eficienciaClimatica =
    totais.totalGeralDiarias > 0
      ? Math.max(0, Math.round(((totais.totalGeralDiarias - custoChuva) / totais.totalGeralDiarias) * 100))
      : 100;

  // Pódio da Semana (Top 3 pilotos por diárias)
  const podioMap = new Map<string, number>();
  for (const l of relatorio?.lancamentosDetalhados || []) {
    if (l.tipo_lancamento !== 'PONTO' || !l.nome_trabalhador) continue;
    podioMap.set(l.nome_trabalhador, (podioMap.get(l.nome_trabalhador) || 0) + 1);
  }
  const podioTop3 = Array.from(podioMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div
      className={`min-h-screen p-6 md:p-8 space-y-6 font-sans transition-colors duration-500 ${
        modoSenna
          ? 'bg-gradient-to-b from-emerald-950 via-slate-950 to-amber-950/60 text-amber-50'
          : drsAtivo
            ? 'bg-gradient-to-b from-purple-950 via-slate-950 to-slate-950 text-purple-50'
            : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Banner Safety Car (Easter Egg 4) */}
      {safetyCar && (
        <div className="p-3 rounded-2xl bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-between animate-pulse shadow-lg">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            SAFETY CAR DEPLOYED — PISTA MOLHADA EM PORTO SEGURO (MANTENHA O DELTA POSITIVO!)
          </span>
          <button
            type="button"
            onClick={() => setSafetyCar(false)}
            className="px-2.5 py-1 rounded-lg bg-slate-950 text-amber-300 text-[10px]"
          >
            TRACK CLEAR
          </button>
        </div>
      )}

      {/* Banner Tributo Senna (Easter Egg 3 — digite "senna") */}
      {modoSenna && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-amber-400 to-blue-700 text-slate-950 font-black text-xs flex items-center justify-between shadow-lg">
          <span>🇧🇷 MODO INTERLAGOS 1991 ATIVADO — &quot;No que diz respeito ao empenho, ao compromisso, ao esforço, à dedicação, não existe meio termo.&quot; — Ayrton Senna</span>
          <button
            type="button"
            onClick={() => setModoSenna(false)}
            className="px-2.5 py-1 rounded-lg bg-slate-950 text-amber-300 text-[10px]"
          >
            Sair
          </button>
        </div>
      )}

      {/* Banner DRS Purple Sector (Easter Egg 1 — 5 cliques no Gauge) */}
      {drsAtivo && (
        <div className="p-3 rounded-2xl bg-purple-600/30 border border-purple-400 text-purple-200 font-mono font-black text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-purple-300" />
            DRS OPEN • PURPLE SECTOR (FASTEST LAP) — CLOUDFLARE EDGE + GOOGLE CLOUD 24/7
          </span>
          <button
            type="button"
            onClick={() => setDrsAtivo(false)}
            className="px-2.5 py-1 rounded-lg bg-purple-500 text-white text-[10px]"
          >
            Fechar DRS
          </button>
        </div>
      )}

      {/* PitWall Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              LIVE TELEMETRY • F1 PITWALL
            </span>
            {/* Semáforo de Largada F1 */}
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 cursor-pointer"
              title="Clique para reiniciar as luzes de largada!"
              onClick={() => setLuzesLargada(5)}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    luzesLargada >= i
                      ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]'
                      : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs font-mono text-slate-400">
              SYNC: {ultimaAtualizacao || '--:--:--'}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleGaugeClick}
              title="Telemetria em tempo real"
              className="focus:outline-none hover:scale-110 transition-transform"
            >
              <Gauge className={`w-7 h-7 ${drsAtivo ? 'text-purple-400' : 'text-emerald-400'}`} />
            </button>
            <span>PitWall Executivo — Ponto Patrícia</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={dispararTeamRadio}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold flex items-center gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>TEAM RADIO</span>
          </button>

          <div
            className={`px-4 py-2 rounded-xl border font-mono text-xs font-bold flex items-center gap-2 ${
              zapStatus === 'CONNECTED'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-400'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>BOT ZAP: {zapStatus === 'CONNECTED' ? 'TRACK GREEN (ONLINE)' : 'BOX (OFFLINE)'}</span>
          </div>

          <button
            type="button"
            onClick={() => void carregarTelemetria()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Team Radio Box (Easter Egg 2) */}
      {radioMsg && (
        <div className="p-4 rounded-2xl bg-slate-900 border-l-4 border-amber-400 shadow-2xl flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>TEAM RADIO • {radioMsg.autor}</span>
            </div>
            <p className="text-sm font-bold text-white italic">&quot;{radioMsg.msg}&quot;</p>
          </div>
          <div className="flex items-end gap-0.5 h-6">
            {[12, 22, 16, 24, 10, 20, 14].map((h, i) => (
              <span
                key={i}
                style={{ height: `${h}px` }}
                className="w-1 bg-amber-400 rounded-full animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

      {/* Telemetria Principal (4 Gauges) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>FOLHA LÍQUIDA SEMANA</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black font-mono text-emerald-400 tabular-nums">
            R$ {Number(totais.totalLiquido || 0).toFixed(2)}
          </div>
          <button
            type="button"
            onClick={() => setMostrarPodio((p) => !p)}
            className="text-[11px] text-slate-400 hover:text-amber-300 transition-colors text-left"
            title="Clique para ver o Pódio da Semana!"
          >
            Bruto: R$ {Number(totais.totalGeralDiarias || 0).toFixed(2)} •{' '}
            <span className="underline decoration-dotted">{totais.totalTrabalhadores} pilotos em pista</span>
          </button>
        </div>

        <div
          onDoubleClick={() => setSafetyCar((p) => !p)}
          title="Duplo clique para status de pista molhada"
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>EFICIÊNCIA CLIMÁTICA</span>
            <CloudRain className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-black font-mono text-sky-400 tabular-nums">
            {eficienciaClimatica}%
          </div>
          <div className="text-[11px] text-slate-400">
            Custo chuva: R$ {custoChuva.toFixed(2)} ({itensChuva.length} diárias)
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>ÍNDICE DE VALES</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black font-mono text-amber-400 tabular-nums">
            {indiceVales}%
          </div>
          <div className="text-[11px] text-slate-400">
            Adiantamentos: R$ {Number(totais.totalGeralVales || 0).toFixed(2)}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>FILA DE BOX (PENDÊNCIAS)</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-black font-mono text-white tabular-nums">
            {dash.lotesPendentes || 0}
          </div>
          <div className="text-[11px] text-slate-400">
            {dash.obrasAtivas || obras.length} circuitos ativos • R$ 0,00/mês infra
          </div>
        </div>
      </div>

      {/* Pódio da Semana (Easter Egg 5) */}
      {mostrarPodio && podioTop3.length > 0 && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-amber-300 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              <span>PÓDIO DA SEMANA — MAIOR RITMO EM PISTA</span>
            </h2>
            <button
              type="button"
              onClick={() => setMostrarPodio(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {podioTop3.map(([nome, qtd], idx) => (
              <div
                key={nome}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <span className="text-[10px] font-mono font-black text-amber-400">
                    P{idx + 1} {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                  </span>
                  <p className="text-sm font-black text-white">{nome}</p>
                </div>
                <span className="text-lg font-mono font-black text-emerald-400 tabular-nums">
                  {qtd}d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timing Tower (Obras) + Feed de Pista */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black font-mono uppercase tracking-wider text-white flex items-center gap-2">
              <Flag className="w-4 h-4 text-emerald-400" />
              <span>Timing Tower — Ritmo por Obra</span>
            </h2>
            <span className="text-[10px] font-mono text-slate-400">SETORES ATIVOS</span>
          </div>
          <div className="space-y-2.5">
            {obras.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Nenhum circuito com telemetria nesta semana.</p>
            ) : (
              obras.map((o, idx) => (
                <div
                  key={o.nomeObra}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 text-xs font-mono font-black text-emerald-400 flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-black text-white truncate">{o.nomeObra}</p>
                      <p className="text-[10px] font-mono text-slate-400">
                        {o.qtdTrabalhadores} piloto(s) • Vales: R$ {Number(o.totalVales || 0).toFixed(0)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-black text-emerald-400 tabular-nums">
                      R$ {Number(o.totalGeral || 0).toFixed(2)}
                    </p>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      S{idx + 1} OK
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black font-mono uppercase tracking-wider text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <span>Race Control — Últimos Registros</span>
            </h2>
            <span className="text-[10px] font-mono text-slate-400">TEMPO REAL</span>
          </div>
          <div className="space-y-2">
            {lancamentos.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Aguardando novas voltas...</p>
            ) : (
              lancamentos.map((l, idx) => (
                <div
                  key={l.id || idx}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="font-mono text-[10px] text-slate-500 mr-2">
                      {l.data_referencia}
                    </span>
                    <span className="font-bold text-white">{l.nome_trabalhador}</span>
                    {l.observacao && (
                      <span className="text-[10px] text-slate-400 ml-2">
                        • {l.observacao.slice(0, 28)}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-black text-emerald-400 tabular-nums shrink-0">
                    R$ {Number(l.valor_monetario || 0).toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Dica discreta dos Easter Eggs */}
      <div className="text-center text-[10px] font-mono text-slate-600 pt-2">
        PITWALL v2.0 • Dica secreta: tente digitar <span className="text-slate-400">senna</span> ou{' '}
        <span className="text-slate-400">box</span>, clique 5x no velocímetro ou 2x no clima 🏎️
      </div>
    </div>
  );
}
