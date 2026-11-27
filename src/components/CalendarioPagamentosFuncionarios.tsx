'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, RefreshCw } from 'lucide-react';

interface CelulaPagamentoDia {
  diariasPagas: number;
  valesPagos: number;
  adiantamentosPagos: number;
  totalDia: number;
  detalhes: string[];
}

interface LinhaPagamentoCalendario {
  nome: string;
  dias: Record<number, CelulaPagamentoDia>;
  totalDiariasPagas: number;
  totalValesPagos: number;
  totalAdiantamentos: number;
  totalPagoMes: number;
}

export default function CalendarioPagamentosFuncionarios() {
  const [mes, setMes] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [diasNoMes, setDiasNoMes] = useState<number>(30);
  const [linhas, setLinhas] = useState<LinhaPagamentoCalendario[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/relatorios/pagamentos-calendario?mes=${encodeURIComponent(mes)}`,
        { cache: 'no-store' }
      );
      const data = (await res.json()) as {
        diasNoMes?: number;
        linhas?: LinhaPagamentoCalendario[];
      };
      setDiasNoMes(data.diasNoMes || 30);
      setLinhas(data.linhas || []);
    } catch {
      setLinhas([]);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const diasArray = Array.from({ length: diasNoMes }, (_, i) => i + 1);
  const totalGeralMes = linhas.reduce((s, l) => s + l.totalPagoMes, 0);

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 bg-emerald-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              Calendário de Pagamentos
            </span>
            <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <CalendarCheck2 className="w-5 h-5 text-emerald-300" />
              <span>Pagamentos Realizados aos Funcionários (Dia a Dia)</span>
            </h2>
          </div>
          <p className="text-xs text-emerald-200/80 mt-0.5">
            Visão cronológica exata de todos os desembolsos efetivados no mês (Diárias Liquidadas, Vales e Adiantamentos).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-emerald-900 border border-emerald-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
          />
          <button
            type="button"
            onClick={() => void carregar()}
            className="px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 text-xs font-bold text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Carregando calendário de pagamentos...
          </div>
        ) : linhas.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum pagamento realizado registrado em {mes}.
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                <th className="p-2 text-left font-black sticky left-0 bg-slate-100 min-w-[140px]">
                  Funcionário
                </th>
                {diasArray.map((d) => (
                  <th
                    key={d}
                    className="p-1 text-center font-bold border-l border-slate-200 min-w-[34px] tabular-nums"
                  >
                    {String(d).padStart(2, '0')}
                  </th>
                ))}
                <th className="p-2 text-right font-black border-l border-slate-300 bg-emerald-50 text-emerald-950 whitespace-nowrap">
                  Total Pago Mês
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {linhas.map((l) => (
                <tr key={l.nome} className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900 sticky left-0 bg-white">
                    {l.nome}
                  </td>
                  {diasArray.map((d) => {
                    const cel = l.dias[d];
                    if (!cel || cel.totalDia <= 0) {
                      return (
                        <td
                          key={d}
                          className="p-1 text-center border-l border-slate-200 text-slate-200"
                        >
                          —
                        </td>
                      );
                    }
                    const cor =
                      cel.diariasPagas > 0
                        ? 'bg-emerald-50 text-emerald-900'
                        : cel.adiantamentosPagos > 0
                          ? 'bg-indigo-50 text-indigo-900'
                          : 'bg-amber-50 text-amber-900';
                    return (
                      <td
                        key={d}
                        title={cel.detalhes.join(' | ')}
                        className={`p-1 text-center border-l border-slate-200 font-black tabular-nums ${cor}`}
                      >
                        {Math.round(cel.totalDia)}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-black border-l border-slate-300 bg-emerald-50/70 text-emerald-950 tabular-nums whitespace-nowrap">
                    R$ {l.totalPagoMes.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-950 text-white font-black">
                <td className="p-2 sticky left-0 bg-emerald-950">TOTAL PAGO</td>
                <td colSpan={diasArray.length} className="p-2 text-right text-[10px] text-emerald-200">
                  Soma de Diárias Liquidadas + Vales + Adiantamentos pagos em {mes}
                </td>
                <td className="p-2 text-right text-emerald-300 tabular-nums whitespace-nowrap">
                  R$ {totalGeralMes.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <span className="font-bold text-slate-700">Legenda:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-emerald-200 inline-block" /> Diárias Liquidadas
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-200 inline-block" /> Vales Pagos
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-indigo-200 inline-block" /> Adiantamento de Diárias
          </span>
        </div>
      </div>
    </section>
  );
}
