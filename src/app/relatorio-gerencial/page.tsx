'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  Send,
  RefreshCw,
  Building2,
  CloudRain,
  Wallet,
  TrendingUp,
  Users,
} from 'lucide-react';
import type {
  ObraDreResumo,
  FluxoDiaItem,
  ColaboradorResumoGerencial,
} from '@/app/api/relatorio-gerencial/route';

type PeriodoGerencial = 'MENSAL' | 'QUINZENA_1' | 'QUINZENA_2';

interface DadosGerenciaisResponse {
  empresa: string;
  periodoLabel: string;
  kpis: {
    custoTotalReal: number;
    maoDeObraBruto: number;
    totalPago: number;
    totalVales: number;
    totalNotasCaixinha: number;
    custoChuvaViagem: number;
    saldoLiquidoAPagar: number;
    adiantamentosAbertosValor: number;
  };
  obras: ObraDreResumo[];
  fluxo: FluxoDiaItem[];
  colaboradores: ColaboradorResumoGerencial[];
}

export default function RelatorioGerencialPage() {
  const [mes, setMes] = useState<string>('2026-11');
  const [periodo, setPeriodo] = useState<PeriodoGerencial>('MENSAL');
  const [obraFiltro, setObraFiltro] = useState<string>('TODAS');
  const [dados, setDados] = useState<DadosGerenciaisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [destinatario, setDestinatario] = useState<'PATRICIA' | 'DANIEL' | 'JOABSON'>('JOABSON');
  const [telJoabson, setTelJoabson] = useState<string>('');
  const [gerandoPdf, setGerandoPdf] = useState<boolean>(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/relatorio-gerencial?mes=${encodeURIComponent(mes)}&periodo=${periodo}&obra=${encodeURIComponent(obraFiltro)}`,
        { cache: 'no-store' }
      );
      const d = (await res.json()) as DadosGerenciaisResponse;
      if (d && d.kpis) setDados(d);
    } finally {
      setLoading(false);
    }
  }, [mes, periodo, obraFiltro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handlePdf(acao: 'PDF_BAIXAR' | 'PDF_ZAP') {
    setGerandoPdf(true);
    setAviso(null);
    try {
      const res = await fetch('/api/relatorio-gerencial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          mes,
          periodo,
          obra: obraFiltro,
          destinatario,
          telefoneCustom: destinatario === 'JOABSON' ? telJoabson : undefined,
        }),
      });
      const d = (await res.json()) as {
        pdfBase64?: string;
        fileName?: string;
        enviadoViaWhatsApp?: boolean;
        message?: string;
        error?: string;
      };
      if (d.error) {
        setAviso(d.error);
        return;
      }
      if (d.message) setAviso(d.message);
      if ((acao === 'PDF_BAIXAR' || !d.enviadoViaWhatsApp) && d.pdfBase64 && d.fileName) {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${d.pdfBase64}`;
        a.download = d.fileName;
        a.click();
      }
    } finally {
      setGerandoPdf(false);
    }
  }

  const kpis = dados?.kpis;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho Executivo */}
      <div className="bg-slate-950 text-white rounded-3xl p-5 sm:p-6 shadow-md flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 mb-2">
            VISÃO DIRETORIA • JOABSON &amp; PATRÍCIA
          </span>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" />
            <span>Relatório Gerencial — DRE &amp; Fluxo por Obra</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Cruzamento completo de Mão de Obra, Vales, Caixinha de Campo, Impacto de Chuva/Viagem e Fluxo Diário de Desembolsos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
          />
          <div className="inline-flex p-0.5 rounded-xl bg-slate-800 border border-slate-700">
            {(
              [
                { k: 'QUINZENA_1', l: '1ª Quinz.' },
                { k: 'QUINZENA_2', l: '2ª Quinz.' },
                { k: 'MENSAL', l: 'Mensal' },
              ] as const
            ).map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => setPeriodo(p.k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                  periodo === p.k ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                {p.l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Barra de Disparo PDF Multi-Página */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-700">PDF Executivo (2 Páginas) para:</span>
          {(['JOABSON', 'PATRICIA', 'DANIEL'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDestinatario(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                destinatario === d
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {d === 'JOABSON' ? 'Joabson' : d === 'PATRICIA' ? 'Patrícia' : 'Daniel'}
            </button>
          ))}
          {destinatario === 'JOABSON' && (
            <input
              type="text"
              placeholder="WhatsApp Joabson (opcional)"
              value={telJoabson}
              onChange={(e) => setTelJoabson(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold w-48"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={gerandoPdf || !dados}
            onClick={() => void handlePdf('PDF_BAIXAR')}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Baixar PDF (2 Págs)</span>
          </button>
          <button
            type="button"
            disabled={gerandoPdf || !dados}
            onClick={() => void handlePdf('PDF_ZAP')}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>{gerandoPdf ? 'Gerando...' : 'Enviar PDF no Zap'}</span>
          </button>
        </div>
      </div>

      {aviso && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
          {aviso}
        </div>
      )}

      {/* 4 KPIs Executivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-slate-700" />
            <span>Custo Total Real</span>
          </p>
          <p className="text-2xl font-black text-slate-950 tabular-nums mt-1">
            R$ {(kpis?.custoTotalReal || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Mão de Obra + Notas Caixinha</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase text-emerald-700 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            <span>Líquido a Pagar</span>
          </p>
          <p className="text-2xl font-black text-emerald-700 tabular-nums mt-1">
            R$ {(kpis?.saldoLiquidoAPagar || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Já pago: R$ {(kpis?.totalPago || 0).toFixed(2)} • Vales: -R$ {(kpis?.totalVales || 0).toFixed(2)}
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase text-indigo-700 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>Caixinha (Materiais)</span>
          </p>
          <p className="text-2xl font-black text-indigo-800 tabular-nums mt-1">
            R$ {(kpis?.totalNotasCaixinha || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Notas fiscais comprovadas no período</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase text-amber-700 flex items-center gap-1.5">
            <CloudRain className="w-3.5 h-3.5" />
            <span>Impacto Chuva / Viagem</span>
          </p>
          <p className="text-2xl font-black text-amber-800 tabular-nums mt-1">
            R$ {(kpis?.custoChuvaViagem || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Dias parados / clima / deslocamento</p>
        </div>
      </div>

      {/* 1. DRE / Custo Real por Obra */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-black">1. DRE Simplificado — Custo Real por Obra</h2>
            <p className="text-xs text-slate-400">
              Cruza Mão de Obra + Notas do Caixinha + Vales + Impacto de Chuva/Viagem por canteiro.
            </p>
          </div>
          {obraFiltro !== 'TODAS' && (
            <button
              type="button"
              onClick={() => setObraFiltro('TODAS')}
              className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-white"
            >
              Ver Todas as Obras
            </button>
          )}
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <th className="py-2 px-3 text-left font-black">Obra</th>
                <th className="py-2 px-3 text-center font-black">Dias</th>
                <th className="py-2 px-3 text-right font-black">Mão de Obra</th>
                <th className="py-2 px-3 text-right font-black">Já Pago</th>
                <th className="py-2 px-3 text-right font-black">Vales</th>
                <th className="py-2 px-3 text-right font-black">Caixinha (Notas)</th>
                <th className="py-2 px-3 text-right font-black">Chuva/Viag.</th>
                <th className="py-2 px-3 text-right font-black">Custo Total</th>
                <th className="py-2 px-3 text-right font-black">Part.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(dados?.obras || []).map((o) => (
                <tr key={o.obraNome} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-black text-slate-900">
                    <button
                      type="button"
                      onClick={() => setObraFiltro(o.obraNome)}
                      className="hover:underline text-left"
                    >
                      {o.obraNome}
                    </button>
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums font-bold">{o.diariasQtd}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold">R$ {o.maoDeObraBruto.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-emerald-700">R$ {o.maoDeObraPago.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-rose-600">- R$ {o.valesTotal.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-indigo-700">R$ {o.notasCaixinha.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-amber-700">R$ {o.custoChuvaViagem.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-black text-slate-950">R$ {o.custoTotalReal.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-black text-slate-600">{o.participacaoPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Fluxo Financeiro Dia a Dia + 3. Posição por Colaborador */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-emerald-950 text-white">
            <h2 className="text-sm font-black">2. Fluxo Financeiro Cronológico (Saídas Dia a Dia)</h2>
            <p className="text-[11px] text-emerald-200/80">Desembolsos diários de Diárias Pagas, Vales e Caixinha.</p>
          </div>
          <div className="p-4 overflow-x-auto max-h-96">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                  <th className="py-2 px-2 text-left font-black">Data</th>
                  <th className="py-2 px-2 text-right font-black">Diárias Pg.</th>
                  <th className="py-2 px-2 text-right font-black">Vales</th>
                  <th className="py-2 px-2 text-right font-black">Caixinha</th>
                  <th className="py-2 px-2 text-right font-black">Total Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dados?.fluxo || []).map((f) => (
                  <tr key={f.data}>
                    <td className="py-2 px-2 font-bold tabular-nums">{f.data}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-700">R$ {f.diariasPagas.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-rose-600">R$ {f.vales.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-indigo-700">R$ {(f.caixinhaPix + f.caixinhaNotas).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-black text-slate-900">R$ {f.totalSaidaDia.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-indigo-950 text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-300" />
            <div>
              <h2 className="text-sm font-black">3. Conferência Líquida por Colaborador</h2>
              <p className="text-[11px] text-indigo-200/80">Bruto, Já Pago, Vales e Saldo Líquido a Pagar.</p>
            </div>
          </div>
          <div className="p-4 overflow-x-auto max-h-96">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                  <th className="py-2 px-2 text-left font-black">Colaborador</th>
                  <th className="py-2 px-2 text-center font-black">Dias</th>
                  <th className="py-2 px-2 text-right font-black">Bruto</th>
                  <th className="py-2 px-2 text-right font-black">Vales</th>
                  <th className="py-2 px-2 text-right font-black">A Pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dados?.colaboradores || []).map((c) => (
                  <tr key={c.nome}>
                    <td className="py-2 px-2 font-black text-slate-900">{c.nome}</td>
                    <td className="py-2 px-2 text-center tabular-nums font-bold">{c.dias}</td>
                    <td className="py-2 px-2 text-right tabular-nums">R$ {c.bruto.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-rose-600">- R$ {c.vales.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-black text-emerald-800">R$ {c.liquidoAPagar.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
