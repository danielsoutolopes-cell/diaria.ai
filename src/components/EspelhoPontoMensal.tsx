'use client';

import React, { useState, useEffect } from 'react';
import { Printer, Calendar, Building2, Send } from 'lucide-react';

interface DestinatarioWhatsApp {
  nome: string;
  telefone: string;
  papel: 'ADMIN' | 'ENCARREGADO' | 'COLABORADOR';
  podeVerValores: boolean;
}

interface LinhaEspelho {
  nome: string;
  dias: Record<number, { fracao: number; tipo: string; obs: string; valor: number }>;
  totalDias: number;
  totalValor: number;
}

export default function EspelhoPontoMensal() {
  const [mes, setMes] = useState<string>('2026-11');
  const [obraId, setObraId] = useState<string>('TODAS');
  const [obras, setObras] = useState<{ id: string; nome: string }[]>([]);
  const [diasNoMes, setDiasNoMes] = useState<number>(30);
  const [linhas, setLinhas] = useState<LinhaEspelho[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [destinatarios, setDestinatarios] = useState<DestinatarioWhatsApp[]>([]);
  const [destinoTel, setDestinoTel] = useState<string>('5511978543369');
  const [enviandoPdf, setEnviandoPdf] = useState<boolean>(false);
  const [msgEnvio, setMsgEnvio] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/relatorios/espelho/enviar')
      .then((r) => r.json())
      .then((d: { destinatarios?: DestinatarioWhatsApp[] }) => {
        if (d.destinatarios && d.destinatarios.length > 0) {
          setDestinatarios(d.destinatarios);
          setDestinoTel(d.destinatarios[0].telefone);
        }
      })
      .catch(() => {});
  }, []);

  async function handleEnviarPdfWhatsApp() {
    if (!destinoTel || linhas.length === 0) return;
    setEnviandoPdf(true);
    setMsgEnvio(null);
    try {
      const destObj = destinatarios.find((d) => d.telefone === destinoTel);
      const res = await fetch('/api/relatorios/espelho/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: destinoTel,
          nomeDestinatario: destObj?.nome,
          podeVerValores: destObj?.podeVerValores ?? false,
          mes,
          diasNoMes,
          linhas,
        }),
      });
      const d = (await res.json()) as {
        message?: string;
        enviadoViaWhatsApp?: boolean;
        pdfBase64?: string;
        fileName?: string;
      };
      if (d.message) {
        setMsgEnvio(d.message);
        setTimeout(() => setMsgEnvio(null), 5000);
      }
      if (!d.enviadoViaWhatsApp && d.pdfBase64 && d.fileName) {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${d.pdfBase64}`;
        a.download = d.fileName;
        a.click();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEnviandoPdf(false);
    }
  }

  async function carregarEspelho() {
    setLoading(true);
    try {
      const res = await fetch(`/api/relatorios/espelho?mes=${mes}&obraId=${obraId}`);
      const data = await res.json();
      if (data && !data.error) {
        setDiasNoMes(data.diasNoMes || 30);
        setObras(data.obras || []);
        setLinhas(data.linhas || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarEspelho();
  }, [mes, obraId]);

  const diasArray = Array.from({ length: diasNoMes }, (_, i) => i + 1);

  function renderSimbolo(info?: { fracao: number; tipo: string }) {
    if (!info) return <span className="text-slate-300">—</span>;
    if (info.tipo === 'CHUVA') return <span title="Dia de Chuva">🌧️</span>;
    if (info.tipo === 'VIAGEM') return <span title="Dia de Viagem">🚗</span>;
    if (info.tipo === 'PARADO') return <span title="Dia Parado">⛔</span>;
    if (info.tipo === 'FALTA') return <span className="text-rose-600 font-black">F</span>;
    if (info.tipo === 'MEIO' || info.fracao === 0.5) return <span className="text-amber-700 font-black">½</span>;
    return <span className="text-emerald-700 font-black">1</span>;
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden print:border-none print:shadow-none">
      {/* Estilo de Impressão em Paisagem */}
      <style jsx global>{`
        @media print {
          @page {
            size: landscape;
            margin: 8mm;
          }
          body * {
            visibility: hidden;
          }
          #espelho-ponto-print,
          #espelho-ponto-print * {
            visibility: visible;
          }
          #espelho-ponto-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>

      <div className="p-6 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
              Relatório 4 • Paisagem
            </span>
            <h2 className="text-lg font-black text-white">Espelho do Ponto (Calendário Mensal)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Visão fiel dia a dia por obra com símbolos de chuva (🌧️), viagem (🚗), meia diária (½) e integral (1).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
            <Calendar className="w-4 h-4 text-sky-400" />
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <select
              value={obraId}
              onChange={(e) => setObraId(e.target.value)}
              className="bg-slate-800 text-xs font-bold text-white focus:outline-none"
            >
              <option value="TODAS">Todas as Obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700">
            <select
              value={destinoTel}
              onChange={(e) => setDestinoTel(e.target.value)}
              className="bg-slate-800 text-xs font-bold text-white focus:outline-none max-w-[190px]"
              title="Escolha o destinatário (Patrícia/Daniel recebem com R$; demais recebem sem R$)"
            >
              {destinatarios.map((d) => (
                <option key={d.telefone} value={d.telefone}>
                  {d.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleEnviarPdfWhatsApp}
              disabled={enviandoPdf || linhas.length === 0}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{enviandoPdf ? 'Enviando...' : 'PDF Zap'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Paisagem</span>
          </button>
        </div>
      </div>

      {msgEnvio && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-900">
          {msgEnvio}
        </div>
      )}

      <div id="espelho-ponto-print" className="p-4 overflow-x-auto">
        <div className="hidden print:flex items-center justify-between mb-3 pb-2 border-b border-slate-300">
          <div>
            <h1 className="text-base font-black text-slate-950">ESPELHO DO PONTO MENSAL — {mes}</h1>
            <p className="text-xs text-slate-600">
              Obra: {obraId === 'TODAS' ? 'TODAS AS OBRAS' : obras.find((o) => o.id === obraId)?.nome}
            </p>
          </div>
          <div className="text-[10px] text-slate-600 font-semibold">
            1 = Integral • ½ = Meio Período • 🌧️ = Chuva • 🚗 = Viagem • ⛔ = Parado • F = Falta
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Carregando espelho do ponto...</div>
        ) : linhas.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum apontamento de ponto encontrado para {mes} nesta obra.
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                <th className="p-2 text-left font-black sticky left-0 bg-slate-100 min-w-[140px]">Colaborador</th>
                {diasArray.map((d) => (
                  <th key={d} className="p-1 text-center font-bold border-l border-slate-200 min-w-[26px]">
                    {String(d).padStart(2, '0')}
                  </th>
                ))}
                <th className="p-2 text-center font-black border-l border-slate-300 bg-emerald-50 text-emerald-900">
                  Dias
                </th>
                <th className="p-2 text-right font-black border-l border-slate-200 bg-emerald-50 text-emerald-900">
                  Total R$
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {linhas.map((l) => (
                <tr key={l.nome} className="hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-900 sticky left-0 bg-white">{l.nome}</td>
                  {diasArray.map((d) => (
                    <td key={d} className="p-1 text-center border-l border-slate-200">
                      {renderSimbolo(l.dias[d])}
                    </td>
                  ))}
                  <td className="p-2 text-center font-black border-l border-slate-300 bg-emerald-50/40 text-emerald-900">
                    {l.totalDias}
                  </td>
                  <td className="p-2 text-right font-black border-l border-slate-200 bg-emerald-50/40 text-emerald-900">
                    R$ {l.totalValor.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 print:hidden">
          <span className="font-bold text-slate-700">Legenda:</span>
          <span><strong className="text-emerald-700">1</strong> Integral</span>
          <span><strong className="text-amber-700">½</strong> Meio Período</span>
          <span>🌧️ Dia de Chuva</span>
          <span>🚗 Viagem</span>
          <span>⛔ Dia Parado</span>
          <span><strong className="text-rose-600">F</strong> Falta</span>
        </div>
      </div>
    </div>
  );
}
