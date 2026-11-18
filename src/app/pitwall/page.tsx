'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

interface PitWallData {
  obrasAtivas: number;
  lotesPendentes: number;
  totalOperarios: number;
  totalVales: number;
  saldoLiquidoSemana: number;
}

export default function PitWallPage() {
  const [dash, setDash] = useState<PitWallData>({
    obrasAtivas: 0,
    lotesPendentes: 0,
    totalOperarios: 0,
    totalVales: 0,
    saldoLiquidoSemana: 0,
  });
  const [relatorio, setRelatorio] = useState<any>(null);
  const [zapStatus, setZapStatus] = useState<string>('CHECKING');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  async function carregarTelemetria() {
    setLoading(true);
    try {
      const [rDash, rRel, rZap] = await Promise.all([
        fetch('/api/dashboard').then((r) => r.json()).catch(() => ({})),
        fetch('/api/relatorios?periodo=semanal').then((r) => r.json()).catch(() => null),
        fetch('/api/whatsapp').then((r) => r.json()).catch(() => ({})),
      ]);

      if (rDash) setDash(rDash);
      if (rRel) setRelatorio(rRel);
      setZapStatus(rZap?.session?.status || 'DISCONNECTED');
      setUltimaAtualizacao(new Date().toLocaleTimeString('pt-BR'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTelemetria();
    const timer = setInterval(carregarTelemetria, 15000);
    return () => clearInterval(timer);
  }, []);

  const totais = relatorio?.totais || { totalGeralDiarias: 0, totalGeralVales: 0, totalLiquido: 0, totalTrabalhadores: 0, totalObras: 0 };
  const obras = relatorio?.custoPorObra || [];
  const lancamentos = (relatorio?.lancamentosDetalhados || []).slice(0, 8);

  const indiceVales =
    totais.totalGeralDiarias > 0
      ? Math.round((totais.totalGeralVales / totais.totalGeralDiarias) * 100)
      : 0;

  const itensChuva = (relatorio?.lancamentosDetalhados || []).filter((l: any) =>
    (l.observacao || '').toUpperCase().includes('CHUVA')
  );
  const custoChuva = itensChuva.reduce((acc: number, l: any) => acc + Number(l.valor_monetario || 0), 0);
  const eficienciaClimatica =
    totais.totalGeralDiarias > 0
      ? Math.max(0, Math.round(((totais.totalGeralDiarias - custoChuva) / totais.totalGeralDiarias) * 100))
      : 100;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-6 font-sans">
      {/* PitWall Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              LIVE TELEMETRY • F1 PITWALL
            </span>
            <span className="text-xs font-mono text-slate-400">
              SYNC: {ultimaAtualizacao || '--:--:--'}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            <Gauge className="w-7 h-7 text-emerald-400" />
            <span>PitWall Executivo — Ponto Patrícia</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
            onClick={carregarTelemetria}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Telemetria Principal (4 Gauges) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>FOLHA LÍQUIDA SEMANA</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black font-mono text-emerald-400">
            R$ {Number(totais.totalLiquido || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400">
            Bruto: R$ {Number(totais.totalGeralDiarias || 0).toFixed(2)} • {totais.totalTrabalhadores} pilotos em pista
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>EFICIÊNCIA CLIMÁTICA</span>
            <CloudRain className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-black font-mono text-sky-400">{eficienciaClimatica}%</div>
          <div className="text-[11px] text-slate-400">
            Custo chuva: R$ {custoChuva.toFixed(2)} ({itensChuva.length} diárias)
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>ÍNDICE DE VALES</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black font-mono text-amber-400">{indiceVales}%</div>
          <div className="text-[11px] text-slate-400">
            Adiantamentos: R$ {Number(totais.totalGeralVales || 0).toFixed(2)}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>BOX / PENDÊNCIAS</span>
            {dash.lotesPendentes > 0 ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div className="text-3xl font-black font-mono text-white">
            {dash.lotesPendentes}{' '}
            <span className="text-sm font-normal text-slate-400">lotes</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {dash.obrasAtivas} circuitos ativos • {dash.totalOperarios} cadastrados
          </div>
        </div>
      </div>

      {/* Setores (Obras) + Team Radio (Últimos Eventos) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Setores / Obras */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Tempos por Setor (Canteiros Ativos)
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">{obras.length} SETORES</span>
          </div>

          <div className="divide-y divide-slate-800">
            {obras.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 font-mono">
                Nenhum setor com telemetria nesta semana.
              </div>
            ) : (
              obras.map((o: any, idx: number) => (
                <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 text-emerald-400 font-mono font-black text-xs flex items-center justify-center">
                      P{idx + 1}
                    </span>
                    <div>
                      <div className="font-black text-sm text-white">{o.nomeObra}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {o.tipoObra} • {o.qtdTrabalhadores} operários
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-black text-emerald-400">
                      R$ {Number(o.totalGeral || 0).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Diárias: R$ {Number(o.totalDiarias || 0).toFixed(0)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team Radio (Últimos Lançamentos) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Team Radio (Últimos Eventos)
            </h2>
          </div>

          <div className="divide-y divide-slate-800 max-h-[360px] overflow-y-auto">
            {lancamentos.map((l: any) => (
              <div key={l.id} className="p-3.5 space-y-1 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-black text-white">{l.nome_trabalhador}</span>
                  <span className="text-emerald-400 font-bold">
                    R$ {Number(l.valor_monetario || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{l.data_referencia} • {l.tipo_lancamento}</span>
                  <span className={l.status === 'VALIDADO' ? 'text-emerald-400' : 'text-amber-400'}>
                    {l.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
