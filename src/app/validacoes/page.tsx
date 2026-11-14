'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarCheck2,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  CloudRain,
  User,
  Check,
  RefreshCw,
} from 'lucide-react';
import { ReceiptLightbox } from '@/components/ReceiptLightbox';

interface PendenteItem {
  id: string;
  loteId: string;
  obra: string;
  data: string;
  trabalhador: string;
  fracao: number;
  motivo: string;
  origem: string;
  valorDiariaBase: number;
  comprovanteUrl?: string | null;
}

export default function ValidacoesPage() {
  const [itens, setItens] = useState<PendenteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [validando, setValidando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function carregarPendentes() {
    setLoading(true);
    try {
      const res = await fetch('/api/pendentes');
      const data = await res.json();
      setItens(data.pendentes || []);
    } catch (e) {
      console.error(e);
      setItens([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPendentes();
  }, []);

  function handleFracaoChange(id: string, novaFracao: number) {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, fracao: novaFracao } : item))
    );
  }

  async function handleValidarTudo() {
    if (itens.length === 0) return;
    setValidando(true);
    try {
      const primeiroLoteId = itens[0]?.loteId;
      await fetch('/api/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loteId: primeiroLoteId,
          ajustes: itens.map((item) => ({
            detalheId: item.id,
            fracao_dia: item.fracao,
            valor_diaria: item.valorDiariaBase,
          })),
        }),
      });

      setSucesso(true);
      setTimeout(() => {
        setItens([]);
        setSucesso(false);
      }, 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setValidando(false);
    }
  }

  const totalCalculado = itens.reduce(
    (acc, curr) => acc + curr.valorDiariaBase * curr.fracao,
    0
  );

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full w-fit mb-2 border border-emerald-200/80 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Fila Human-in-the-Loop • Aprovação Rápida</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Validações de Campo
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Confira as sugestões da IA e aprove os apontamentos com um único toque.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={carregarPendentes}
            disabled={loading}
            className="p-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl transition-all shadow-sm"
            title="Atualizar fila"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {itens.length > 0 && (
            <>
              <div className="text-right hidden sm:block">
                <span className="text-[11px] text-slate-400 font-medium block">Total deste lote</span>
                <span className="text-lg font-black text-emerald-700">
                  R$ {totalCalculado.toFixed(2)}
                </span>
              </div>

              <button
                onClick={handleValidarTudo}
                disabled={validando}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-emerald-700/25 flex items-center gap-2 active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{validando ? 'Validando...' : `Aprovar Todos (${itens.length})`}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {sucesso && (
        <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-3xl flex items-center gap-3.5 text-emerald-900 shadow-md">
          <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 stroke-[3]" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Apontamentos Aprovados com Sucesso!</h4>
            <p className="text-xs text-emerald-800">
              O status foi atualizado para VALIDADO no banco e os recibos de confirmação foram registrados.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-14 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Buscando pendências reais no banco de dados...</p>
        </div>
      ) : itens.length === 0 ? (
        <div className="bg-white p-14 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Nenhuma pendência no momento!</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Todas as mensagens dos mestres e encarregados foram revisadas. Novos lotes aparecerão aqui assim que mensagens forem enviadas no WhatsApp monitorado ou no Terminal de IA.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {itens.map((item) => {
            const valorCalculado = item.valorDiariaBase * item.fracao;

            return (
              <div
                key={item.id}
                className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                      {item.obra}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">• {item.data}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-950 tracking-tight">
                      {item.trabalhador}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 w-fit">
                    {item.motivo.toLowerCase().includes('chuva') ? (
                      <CloudRain className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <span>{item.motivo}</span>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <div className="text-[11px] text-slate-400">{item.origem}</div>
                    {item.comprovanteUrl && (
                      <ReceiptLightbox
                        comprovanteUrl={item.comprovanteUrl}
                        nomeFuncionario={item.trabalhador}
                        dataReferencia={item.data}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 self-end md:self-center">
                  <div className="text-right sm:pr-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                      A Pagar
                    </span>
                    <span className="text-xl font-black text-slate-950">
                      R$ {valorCalculado.toFixed(2)}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Base: R$ {item.valorDiariaBase.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center p-1.5 bg-slate-100 rounded-2xl border border-slate-200/70 gap-1">
                    <button
                      type="button"
                      onClick={() => handleFracaoChange(item.id, 1.0)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        item.fracao === 1.0
                          ? 'bg-white text-emerald-800 shadow-sm font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      1.0 Integral
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFracaoChange(item.id, 0.5)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        item.fracao === 0.5
                          ? 'bg-amber-500 text-white shadow-sm font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ½ Chuva
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFracaoChange(item.id, 0.0)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        item.fracao === 0.0
                          ? 'bg-rose-500 text-white shadow-sm font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      0 Falta
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
