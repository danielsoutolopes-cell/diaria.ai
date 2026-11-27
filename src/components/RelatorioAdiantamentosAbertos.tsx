'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, RefreshCw, ArrowUpRight } from 'lucide-react';

interface AdiantamentoAberto {
  id: string;
  funcionario_nome: string;
  obra_nome: string;
  data_adiantamento: string;
  quantidade_diarias: number;
  quantidade_restante: number;
  valor_unitario: number;
  valor_total: number;
  status: 'ATIVO' | 'QUITADO' | 'CANCELADO';
  observacao: string | null;
}

export default function RelatorioAdiantamentosAbertos() {
  const [loading, setLoading] = useState(true);
  const [ativos, setAtivos] = useState<AdiantamentoAberto[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/adiantamentos-diarias', { cache: 'no-store' });
      const data = (await res.json()) as { adiantamentos?: AdiantamentoAberto[] };
      const lista = (data.adiantamentos || []).filter(
        (a) => a.status === 'ATIVO' && Number(a.quantidade_restante) > 0
      );
      setAtivos(lista);
    } catch {
      setAtivos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalDiariasRestantes = ativos.reduce(
    (s, a) => s + Number(a.quantidade_restante || 0),
    0
  );
  const totalValorRestante = ativos.reduce(
    (s, a) => s + Number(a.quantidade_restante || 0) * Number(a.valor_unitario || 0),
    0
  );

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 bg-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              Relatório 5 • Adiantamentos
            </span>
            <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-indigo-300" />
              <span>Painel de Adiantamentos de Diárias em Aberto</span>
            </h2>
          </div>
          <p className="text-xs text-indigo-200/80 mt-0.5">
            Saldos de diárias pagas antecipadamente aguardando abatimento automático nos próximos apontamentos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            className="px-3 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-800 border border-indigo-700 text-xs font-bold text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
          <Link
            href="/validacao/vales"
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1"
          >
            <span>Lançar / Gerenciar</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200">
          <p className="text-[10px] font-black uppercase text-slate-500">Colaboradores c/ Saldo</p>
          <p className="text-xl font-black text-slate-950 tabular-nums mt-0.5">
            {ativos.length}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200">
          <p className="text-[10px] font-black uppercase text-slate-500">Diárias a Abater</p>
          <p className="text-xl font-black text-indigo-700 tabular-nums mt-0.5">
            {totalDiariasRestantes.toFixed(1)} dia(s)
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200">
          <p className="text-[10px] font-black uppercase text-slate-500">Valor em Aberto</p>
          <p className="text-xl font-black text-amber-700 tabular-nums mt-0.5">
            R$ {totalValorRestante.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="p-4 sm:p-6 overflow-x-auto">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Carregando adiantamentos em aberto...
          </div>
        ) : ativos.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Nenhum adiantamento de diárias em aberto no momento.
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                <th className="py-2 px-3 text-left font-black">Colaborador</th>
                <th className="py-2 px-3 text-left font-black">Obra Ref.</th>
                <th className="py-2 px-3 text-center font-black">Pago em</th>
                <th className="py-2 px-3 text-center font-black">Progresso</th>
                <th className="py-2 px-3 text-right font-black">Saldo Restante (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ativos.map((a) => {
                const total = Number(a.quantidade_diarias || 1);
                const rest = Number(a.quantidade_restante || 0);
                const cumprido = Math.max(0, total - rest);
                const pct = Math.min(100, Math.round((cumprido / total) * 100));
                const valorRest = rest * Number(a.valor_unitario || 0);

                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-black text-slate-900">
                      {a.funcionario_nome}
                      {a.observacao && (
                        <p className="text-[10px] font-normal text-slate-400">
                          {a.observacao}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-600">{a.obra_nome}</td>
                    <td className="py-3 px-3 text-center tabular-nums text-slate-600">
                      {a.data_adiantamento}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-black text-indigo-800 tabular-nums">
                          Restam {rest} de {total} diária(s)
                        </span>
                        <div className="w-28 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-black text-amber-800 tabular-nums whitespace-nowrap">
                      R$ {valorRest.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
