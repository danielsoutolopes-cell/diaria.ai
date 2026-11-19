'use client';

import React, { useState, useEffect } from 'react';
import {
  Printer,
  CalendarDays,
  Wallet,
  Receipt,
  ArrowDownCircle,
} from 'lucide-react';

interface EventoCalendarioFinanceiro {
  id: string;
  dia: number;
  categoria: 'VALE' | 'PIX_CAIXA' | 'NOTA_CAMPO';
  rotulo: string;
  valor: number;
  obra: string;
}

export default function CalendarioValesCaixa() {
  const [mes, setMes] = useState<string>('2026-11');
  const [diasNoMes, setDiasNoMes] = useState<number>(30);
  const [totalVales, setTotalVales] = useState<number>(0);
  const [totalPixCaixa, setTotalPixCaixa] = useState<number>(0);
  const [totalNotasCampo, setTotalNotasCampo] = useState<number>(0);
  const [saldoCampoEmMaos, setSaldoCampoEmMaos] = useState<number>(0);
  const [eventos, setEventos] = useState<EventoCalendarioFinanceiro[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      try {
        const res = await fetch(`/api/relatorios/vales-calendario?mes=${mes}`, {
          cache: 'no-store',
        });
        const d = (await res.json()) as {
          diasNoMes?: number;
          totalVales?: number;
          totalPixCaixa?: number;
          totalNotasCampo?: number;
          saldoCampoEmMaos?: number;
          eventos?: EventoCalendarioFinanceiro[];
        };
        setDiasNoMes(d.diasNoMes || 30);
        setTotalVales(d.totalVales || 0);
        setTotalPixCaixa(d.totalPixCaixa || 0);
        setTotalNotasCampo(d.totalNotasCampo || 0);
        setSaldoCampoEmMaos(d.saldoCampoEmMaos || 0);
        setEventos(d.eventos || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    void carregar();
  }, [mes]);

  const [anoStr, mesStr] = mes.split('-');
  const primeiroDiaSemana = new Date(
    Number(anoStr),
    Number(mesStr) - 1,
    1
  ).getDay();

  const celulas: Array<{ dia: number | null }> = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push({ dia: null });
  for (let d = 1; d <= diasNoMes; d++) celulas.push({ dia: d });

  const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Relatório 6 • Vales, Reembolsos & Caixa de Campo
            </span>
            <h2 className="text-lg font-black text-white">
              Calendário Financeiro de Campo
            </h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Visão dia a dia de Vales pessoais, Suprimentos PIX de obra e Notas Fiscais comprovadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
            <CalendarDays className="w-4 h-4 text-rose-400" />
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Calendário</span>
          </button>
        </div>
      </div>

      {/* 3 KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border-b border-slate-200/80">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase">
              Total em Vales no Mês
            </span>
            <p className="text-xl font-black text-rose-600">
              R$ {totalVales.toFixed(2)}
            </p>
          </div>
          <Receipt className="w-6 h-6 text-rose-500" />
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase">
              PIX Caixa de Campo (Entrada)
            </span>
            <p className="text-xl font-black text-emerald-700">
              R$ {totalPixCaixa.toFixed(2)}
            </p>
          </div>
          <ArrowDownCircle className="w-6 h-6 text-emerald-600" />
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase">
              Notas Comprovadas • Saldo Campo
            </span>
            <p className="text-lg font-black text-amber-800">
              R$ {totalNotasCampo.toFixed(2)}{' '}
              <span className="text-xs font-bold text-slate-500">
                (Em mãos: R$ {saldoCampoEmMaos.toFixed(2)})
              </span>
            </p>
          </div>
          <Wallet className="w-6 h-6 text-amber-600" />
        </div>
      </div>

      {/* Grade 7 colunas */}
      <div className="p-4 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Carregando calendário de vales e caixa de campo...
          </div>
        ) : (
          <div className="min-w-[760px] space-y-2">
            <div className="grid grid-cols-7 gap-2">
              {diasSemana.map((ds) => (
                <div
                  key={ds}
                  className="text-center text-[11px] font-black text-slate-500 bg-slate-100 py-1.5 rounded-xl"
                >
                  {ds}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {celulas.map((cel, idx) => {
                if (!cel.dia) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[110px] rounded-2xl bg-slate-50/40 border border-dashed border-slate-100"
                    />
                  );
                }

                const evDia = eventos.filter((e) => e.dia === cel.dia);
                const somaValesDia = evDia
                  .filter((e) => e.categoria === 'VALE')
                  .reduce((acc, e) => acc + e.valor, 0);

                return (
                  <div
                    key={cel.dia}
                    className={`min-h-[115px] p-2.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                      evDia.length > 0
                        ? 'bg-white border-slate-200 shadow-xs'
                        : 'bg-slate-50/30 border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800">
                        {String(cel.dia).padStart(2, '0')}
                      </span>
                      {somaValesDia > 0 && (
                        <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md">
                          −R$ {somaValesDia.toFixed(0)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {evDia.map((ev) => (
                        <div
                          key={ev.id}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center justify-between gap-1 truncate ${
                            ev.categoria === 'VALE'
                              ? 'bg-rose-50 text-rose-800'
                              : ev.categoria === 'PIX_CAIXA'
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-amber-50 text-amber-900'
                          }`}
                          title={`${ev.rotulo} (${ev.obra}) — R$ ${ev.valor.toFixed(2)}`}
                        >
                          <span className="truncate">{ev.rotulo}</span>
                          <span className="shrink-0 font-black">
                            {ev.categoria === 'PIX_CAIXA' ? '+' : ''}
                            {ev.valor.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
