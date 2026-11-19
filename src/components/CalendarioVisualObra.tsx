'use client';

import React, { useState, useEffect } from 'react';
import { Printer, CalendarDays, Building2, CloudRain, DollarSign, TrendingUp, Send } from 'lucide-react';

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

export default function CalendarioVisualObra() {
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

  useEffect(() => {
    async function carregar() {
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
    carregar();
  }, [mes, obraId]);

  // Calcula dia da semana do dia 1 do mês (0 = Dom ... 6 = Sáb)
  const [anoStr, mesStr] = mes.split('-');
  const primeiroDiaSemana = new Date(Number(anoStr), Number(mesStr) - 1, 1).getDay();

  // Monta células do calendário
  const celulas: (number | null)[] = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];

  // Agrupa dados por dia
  const porDia = new Map<number, { trabalhadores: { nome: string; tipo: string; fracao: number; valor: number }[]; totalDia: number; temChuva: boolean }>();
  let totalFinanceiroMes = 0;
  let totalCustoChuva = 0;
  let totalCustoViagem = 0;
  let diasComChuva = new Set<number>();

  linhas.forEach((l) => {
    Object.entries(l.dias).forEach(([diaStr, info]) => {
      const d = Number(diaStr);
      if (!porDia.has(d)) {
        porDia.set(d, { trabalhadores: [], totalDia: 0, temChuva: false });
      }
      const reg = porDia.get(d)!;
      reg.trabalhadores.push({ nome: l.nome, tipo: info.tipo, fracao: info.fracao, valor: info.valor });
      reg.totalDia += info.valor;
      totalFinanceiroMes += info.valor;
      if (info.tipo === 'CHUVA') {
        reg.temChuva = true;
        totalCustoChuva += info.valor;
        diasComChuva.add(d);
      }
      if (info.tipo === 'VIAGEM') {
        totalCustoViagem += info.valor;
      }
    });
  });

  function badgeSimbolo(tipo: string, fracao: number) {
    if (tipo === 'CHUVA') return '🌧️';
    if (tipo === 'VIAGEM') return '🚗';
    if (tipo === 'PARADO') return '⛔';
    if (tipo === 'FALTA') return 'F';
    if (tipo === 'MEIO' || fracao === 0.5) return '½';
    return '1';
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
      <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Relatório 5 • Calendário Visual & Clima
            </span>
            <h2 className="text-lg font-black text-white">Calendário de Obra (Visão Mensal)</h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Todos os colaboradores por dia do mês com impacto financeiro e climático em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
            <CalendarDays className="w-4 h-4 text-indigo-400" />
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
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

          <div className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700">
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
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{enviandoPdf ? 'Enviando...' : 'PDF Zap'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Calendário</span>
          </button>
        </div>
      </div>

      {msgEnvio && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-900">
          {msgEnvio}
        </div>
      )}

      {/* KPIs Financeiros e Climáticos do Mês */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border-b border-slate-200/80">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase">Custo Total no Mês</span>
            <div className="text-xl font-black text-slate-950">R$ {totalFinanceiroMes.toFixed(2)}</div>
          </div>
          <DollarSign className="w-6 h-6 text-emerald-600" />
        </div>

        <div className="bg-white p-4 rounded-2xl border border-sky-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-sky-700 uppercase">Impacto Climático (Chuva)</span>
            <div className="text-xl font-black text-sky-900">
              R$ {totalCustoChuva.toFixed(2)}{' '}
              <span className="text-xs font-semibold text-sky-600">({diasComChuva.size} dias 🌧️)</span>
            </div>
          </div>
          <CloudRain className="w-6 h-6 text-sky-500" />
        </div>

        <div className="bg-white p-4 rounded-2xl border border-indigo-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-indigo-700 uppercase">Produtividade / Viagem</span>
            <div className="text-xl font-black text-indigo-950">
              {totalFinanceiroMes > 0
                ? `${Math.round(((totalFinanceiroMes - totalCustoChuva) / totalFinanceiroMes) * 100)}%`
                : '100%'}{' '}
              <span className="text-xs font-semibold text-slate-500">
                (Viagem: R$ {totalCustoViagem.toFixed(2)})
              </span>
            </div>
          </div>
          <TrendingUp className="w-6 h-6 text-indigo-600" />
        </div>
      </div>

      {/* Grade de Calendário (Dom a Sáb) */}
      <div className="p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Montando calendário visual...</div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((diaSem) => (
              <div key={diaSem} className="text-center text-[11px] font-black uppercase text-slate-500 py-1.5 bg-slate-100 rounded-xl">
                {diaSem}
              </div>
            ))}

            {celulas.map((dia, idx) => {
              if (!dia) {
                return <div key={`empty-${idx}`} className="min-h-[100px] bg-slate-50/40 rounded-2xl border border-dashed border-slate-200/60" />;
              }

              const infoDia = porDia.get(dia);
              return (
                <div
                  key={dia}
                  className={`min-h-[110px] p-2 rounded-2xl border flex flex-col justify-between transition-all ${
                    infoDia?.temChuva
                      ? 'bg-sky-50/60 border-sky-200'
                      : infoDia
                      ? 'bg-white border-emerald-200/80 shadow-sm'
                      : 'bg-slate-50/50 border-slate-200/70'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1">
                    <span className="text-xs font-black text-slate-800">{String(dia).padStart(2, '0')}</span>
                    {infoDia && (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                        R$ {infoDia.totalDia.toFixed(0)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5 flex-1">
                    {(infoDia?.trabalhadores || []).map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] leading-tight">
                        <span className="font-semibold text-slate-700 truncate max-w-[85px]" title={t.nome}>
                          {t.nome}
                        </span>
                        <span className="font-black">{badgeSimbolo(t.tipo, t.fracao)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
