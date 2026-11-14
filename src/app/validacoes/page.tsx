'use client';

import React, { useState } from 'react';
import {
  CalendarCheck2,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  CloudRain,
  ChevronDown,
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
      data: 'Hoje',
      trabalhador: 'Pedro Souza',
      fracao: 0.5,
      motivo: 'Choveu na parte da tarde, dispensados às 13h',
      origem: 'WhatsApp - Mestre Carlos',
      valorDiariaBase: 160,
    },
    {
      id: 'val-2',
      obra: 'OBRA BAHIA (PISCINA)',
      data: 'Hoje',
      trabalhador: 'José Silva',
      fracao: 1.0,
      motivo: 'Ficou no acabamento interno até 17h',
      origem: 'WhatsApp - Mestre Carlos',
      valorDiariaBase: 180,
    },
    {
      id: 'val-3',
      obra: 'JABAQUARA (OBRA CIVIL)',
      data: 'Hoje',
      trabalhador: 'Miguel Santos',
      fracao: 1.0,
      motivo: 'Dia integral de alvenaria',
      origem: 'WhatsApp - Mestre Fábio',
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
      }, 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full w-fit mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fila de Aprovação Rápida (Human-in-the-Loop)</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Validações Pendentes de Ponto
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Revise as frações sugeridas pelo Gemini 1.5 Flash antes de consolidar a folha de pagamento.
          </p>
        </div>

        {itens.length > 0 && (
          <button
            onClick={handleValidarTudo}
            disabled={loading}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-700/20 flex items-center gap-2 self-start"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{loading ? 'Validando...' : 'Validar Todos e Notificar Bot'}</span>
          </button>
        )}
      </div>

      {sucesso && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>✅ Pontos aprovados com sucesso! Os lançamentos foram alterados para VALIDADO e o bot avisará o grupo da obra.</span>
        </div>
      )}

      {itens.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Tudo limpo por aqui!</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Não há novos apontamentos de obras aguardando aprovação no momento. Quando os encarregados enviarem mensagens no WhatsApp, elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {itens.map((item) => (
            <div
              key={item.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                    {item.obra}
                  </span>
                  <span className="text-xs text-slate-400">• {item.data}</span>
                </div>
                <h4 className="text-base font-bold text-slate-900">{item.trabalhador}</h4>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Motivo: {item.motivo}</span>
                </div>
                <div className="text-[11px] text-slate-400">Origem: {item.origem}</div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Fração do Dia</div>
                  <div className="font-bold text-sm text-slate-900">
                    R$ {(item.valorDiariaBase * item.fracao).toFixed(2)}
                  </div>
                </div>

                <select
                  value={item.fracao}
                  onChange={(e) => handleFracaoChange(item.id, parseFloat(e.target.value))}
                  aria-label="Fração do Dia"
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value={1.0}>Dia Integral (1.0)</option>
                  <option value={0.5}>Meio Dia / Chuva (0.5)</option>
                  <option value={0.0}>Falta / Atestado (0.0)</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
