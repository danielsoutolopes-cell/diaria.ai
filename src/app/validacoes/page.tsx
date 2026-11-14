'use client';

import React, { useState } from 'react';
import {
  CalendarCheck2,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  CloudRain,
  ChevronRight,
  Sun,
  User,
  Check,
} from 'lucide-react';

interface MockItem {
  id: string;
  obra: string;
  data: string;
  trabalhador: string;
  fracao: number;
  motivo: string;
  origem: string;
  valorDiariaBase: number;
}

export default function ValidacoesPage() {
  const [itens, setItens] = useState<MockItem[]>([
    {
      id: 'val-1',
      obra: 'OBRA BAHIA (PISCINA)',
      data: 'Hoje, 13:45',
      trabalhador: 'Pedro Souza',
      fracao: 0.5,
      motivo: 'Choveu na parte da tarde, dispensados às 13h',
      origem: 'WhatsApp • Encarregado Carlos',
      valorDiariaBase: 160,
    },
    {
      id: 'val-2',
      obra: 'OBRA BAHIA (PISCINA)',
      data: 'Hoje, 13:45',
      trabalhador: 'José Silva',
      fracao: 1.0,
      motivo: 'Ficou no acabamento interno protegido da chuva',
      origem: 'WhatsApp • Encarregado Carlos',
      valorDiariaBase: 180,
    },
    {
      id: 'val-3',
      obra: 'JABAQUARA (OBRA CIVIL)',
      data: 'Hoje, 12:10',
      trabalhador: 'Miguel Santos',
      fracao: 1.0,
      motivo: 'Dia integral de alvenaria estrutural',
      origem: 'WhatsApp • Encarregado Fábio',
      valorDiariaBase: 150,
    },
  ]);

  const [sucesso, setSucesso] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleFracaoChange(id: string, novaFracao: number) {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, fracao: novaFracao } : item))
    );
  }

  async function handleValidarTudo() {
    setLoading(true);
    try {
      await fetch('/api/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loteId: 'lote-demo-001',
          ajustes: itens.map((item) => ({
            lancamentoId: item.id,
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
      setLoading(false);
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

        {itens.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <span className="text-[11px] text-slate-400 font-medium block">Total deste lote</span>
              <span className="text-lg font-black text-emerald-700">
                R$ {totalCalculado.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleValidarTudo}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-emerald-700/25 flex items-center gap-2 active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{loading ? 'Validando...' : 'Aprovar Todos (3)'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {sucesso && (
        <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-3xl flex items-center gap-3.5 text-emerald-900 shadow-md animate-fade-in">
          <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 stroke-[3]" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Apontamentos Aprovados com Sucesso!</h4>
            <p className="text-xs text-emerald-800">
              O status foi atualizado para VALIDADO no banco e os recibos de confirmação foram disparados nos grupos oficiais.
            </p>
          </div>
        </div>
      )}

      {itens.length === 0 ? (
        <div className="bg-white p-14 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Nenhuma pendência no momento!</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Todas as mensagens dos mestres e encarregados foram revisadas. Novos lotes aparecerão aqui assim que chegarem no WhatsApp.
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
                {/* Left: Info */}
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

                  <div className="text-[11px] text-slate-400">{item.origem}</div>
                </div>

                {/* Right: Segmented Control & Price Display */}
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

                  {/* Segmented Pill Selector */}
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
                      ½ Meio Dia / Chuva
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
