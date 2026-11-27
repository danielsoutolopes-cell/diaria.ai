'use client';

import React, { useState, useEffect } from 'react';
import { Printer, Calendar, Building2, Send } from 'lucide-react';

interface DestinatarioWhatsApp {
  nome: string;
  telefone: string;
  papel: 'ADMIN' | 'ENCARREGADO' | 'COLABORADOR';
  podeVerValores: boolean;
}

interface CelulaDiaEspelhoUI {
  fracao: number;
  tipo: string;
  obs: string;
  valor: number;
  pago?: boolean;
  dataPagamento?: string | null;
  valeDia?: number;
  partes?: Array<{
    obra: string;
    fracao: number;
    valor: number;
    tipo: string;
    pago?: boolean;
    dataPagamento?: string | null;
  }>;
}

interface LinhaEspelho {
  nome: string;
  dias: Record<number, CelulaDiaEspelhoUI>;
  totalDias: number;
  totalValor: number;
  totalPago?: number;
  totalVales?: number;
  saldoAPagar?: number;
  ultimoPagamentoData?: string | null;
}

export default function EspelhoPontoMensal() {
  const [modoVisao, setModoVisao] = useState<'PRESENCA' | 'FINANCEIRO'>('FINANCEIRO');
  const [tipoValor, setTipoValor] = useState<'LIQUIDO' | 'BRUTO'>('LIQUIDO');
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

  function renderSimbolo(info?: {
    fracao: number;
    tipo: string;
    obs?: string;
    partes?: Array<{ obra: string; fracao: number; valor: number }>;
  }) {
    if (!info) return <span className="text-slate-300">—</span>;
    if (info.tipo === 'RATEIO' || (info.partes && info.partes.length >= 2)) {
      const detalhe =
        info.obs ||
        info.partes
          ?.map((p) => `${p.fracao.toFixed(1).replace('.', ',')}d ${p.obra}`)
          .join(' + ') ||
        'Rateio Multi-Obra (½ + ½)';
      return (
        <span
          title={detalhe}
          className="inline-block px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-black text-[10px] leading-none"
        >
          ½+½
        </span>
      );
    }
    if (info.tipo === 'CHUVA')
      return <span title="Dia de Chuva (R$ 120,00)">🌧️</span>;
    if (info.tipo === 'VIAGEM') return <span title="Dia de Viagem">🚗</span>;
    if (info.tipo === 'PARADO') return <span title="Dia Parado">⛔</span>;
    if (info.tipo === 'FALTA')
      return <span className="text-rose-600 font-black">F</span>;
    if (info.tipo === 'MEIO' || info.fracao === 0.5)
      return (
        <span title={info.obs || 'Meio Período'} className="text-amber-700 font-black">
          ½
        </span>
      );
    return (
      <span title={info.obs || 'Dia Integral'} className="text-emerald-700 font-black">
        1
      </span>
    );
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

      <div className="p-4 sm:p-6 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
              Relatório 4 • Paisagem
            </span>
            <h2 className="text-base sm:text-lg font-black text-white">Espelho do Ponto (Calendário Mensal)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Visão fiel dia a dia por obra com símbolos de chuva (🌧️), viagem (🚗), meia diária (½) e integral (1).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="inline-flex p-0.5 rounded-xl bg-slate-800 border border-slate-700">
            <button
              type="button"
              onClick={() => setModoVisao('PRESENCA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                modoVisao === 'PRESENCA'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Presença
            </button>
            <button
              type="button"
              onClick={() => setModoVisao('FINANCEIRO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                modoVisao === 'FINANCEIRO'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Financeiro
            </button>
          </div>

          <div className="inline-flex p-0.5 rounded-xl bg-slate-800 border border-slate-700">
            <button
              type="button"
              onClick={() => setTipoValor('LIQUIDO')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                tipoValor === 'LIQUIDO'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Líquido
            </button>
            <button
              type="button"
              onClick={() => setTipoValor('BRUTO')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                tipoValor === 'BRUTO'
                  ? 'bg-slate-200 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Bruto
            </button>
          </div>

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
              className="bg-slate-800 text-xs font-bold text-white focus:outline-none max-w-[160px] sm:max-w-[190px]"
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

      <div className="md:hidden px-4 py-2 bg-sky-50 border-b border-sky-100 text-[11px] font-bold text-sky-800 text-center print:hidden">
        ← Deslize lateralmente ou gire o celular para ver os 31 dias →
      </div>

      <div id="espelho-ponto-print" className="p-3 sm:p-4 overflow-x-auto touch-scroll-x">
        <div className="hidden print:flex items-center justify-between mb-3 pb-2 border-b border-slate-300">
          <div>
            <h1 className="text-base font-black text-slate-950">ESPELHO DO PONTO MENSAL — {mes}</h1>
            <p className="text-xs text-slate-600">
              Obra: {obraId === 'TODAS' ? 'TODAS AS OBRAS' : obras.find((o) => o.id === obraId)?.nome}
            </p>
          </div>
          <div className="text-[10px] text-slate-600 font-semibold">
            1 = Integral • ½ = Meio Período • ½+½ = Rateio Multi-Obra • 🌧️ = Chuva (R$ 120) • 🚗 = Viagem • ⛔ = Parado • F = Falta
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
                  <th key={d} className="p-1 text-center font-bold border-l border-slate-200 min-w-[28px] tabular-nums">
                    {String(d).padStart(2, '0')}
                  </th>
                ))}
                <th className="p-2 text-center font-black border-l border-slate-300 bg-emerald-50 text-emerald-900">
                  Dias
                </th>
                {modoVisao === 'FINANCEIRO' && (
                  <>
                    <th className="p-2 text-right font-black border-l border-slate-200 bg-emerald-50 text-emerald-800">
                      Já Pago
                    </th>
                    <th className="p-2 text-right font-black border-l border-slate-200 bg-rose-50 text-rose-800">
                      Vales
                    </th>
                  </>
                )}
                <th className="p-2 text-right font-black border-l border-slate-300 bg-amber-50 text-amber-950 whitespace-nowrap">
                  {tipoValor === 'LIQUIDO' ? 'Líquido a Pagar' : 'Bruto Mês'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {linhas.map((l) => {
                const pago = Number(l.totalPago || 0);
                const vales = Number(l.totalVales || 0);
                const aPagar =
                  typeof l.saldoAPagar === 'number'
                    ? l.saldoAPagar
                    : Math.max(0, Number((l.totalValor - pago - vales).toFixed(2)));

                return (
                  <tr key={l.nome} className="hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-900 sticky left-0 bg-white">
                      <div>{l.nome}</div>
                      {modoVisao === 'FINANCEIRO' && l.ultimoPagamentoData && (
                        <div className="text-[9px] font-bold text-emerald-700">
                          Últ. pgto: {l.ultimoPagamentoData}
                        </div>
                      )}
                    </td>
                    {diasArray.map((d) => {
                      const cel = l.dias[d];
                      if (modoVisao === 'PRESENCA') {
                        return (
                          <td key={d} className="p-1 text-center border-l border-slate-200">
                            {cel && cel.tipo !== 'VALE_ONLY' ? renderSimbolo(cel) : <span className="text-slate-200">—</span>}
                          </td>
                        );
                      }

                      if (!cel) {
                        return (
                          <td key={d} className="p-1 text-center border-l border-slate-200 text-slate-200">
                            —
                          </td>
                        );
                      }

                      const temDiaria = cel.valor > 0;
                      const temVale = Number(cel.valeDia || 0) > 0;
                      const titleText = [
                        cel.obs,
                        temDiaria
                          ? cel.pago
                            ? `PAGO${cel.dataPagamento ? ` em ${cel.dataPagamento}` : ''} (R$ ${cel.valor.toFixed(2)})`
                            : `EM ABERTO (R$ ${cel.valor.toFixed(2)})`
                          : null,
                        temVale ? `Vale descontado: -R$ ${Number(cel.valeDia).toFixed(2)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' • ');

                      return (
                        <td
                          key={d}
                          title={titleText}
                          className={`p-1 text-center border-l border-slate-200 tabular-nums align-middle ${
                            temDiaria && cel.pago
                              ? 'bg-emerald-50/80 text-emerald-900'
                              : temDiaria
                                ? 'bg-amber-50/40 text-slate-800'
                                : ''
                          }`}
                        >
                          {temDiaria && (
                            <div className="leading-tight">
                              <div className="text-[10px] font-black">
                                {cel.pago ? '✓' : ''}{Math.round(cel.valor)}
                              </div>
                              {cel.pago && cel.dataPagamento && (
                                <div className="text-[8px] font-bold text-emerald-700">
                                  {cel.dataPagamento}
                                </div>
                              )}
                            </div>
                          )}
                          {temVale && (
                            <div className="text-[9px] font-black text-rose-600 leading-tight">
                              -{Math.round(Number(cel.valeDia))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center font-black border-l border-slate-300 bg-emerald-50/40 text-emerald-900 tabular-nums">
                      {l.totalDias}
                    </td>
                    {modoVisao === 'FINANCEIRO' && (
                      <>
                        <td className="p-2 text-right font-bold border-l border-slate-200 bg-emerald-50/50 text-emerald-800 tabular-nums whitespace-nowrap">
                          R$ {pago.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-bold border-l border-slate-200 bg-rose-50/50 text-rose-700 tabular-nums whitespace-nowrap">
                          {vales > 0 ? `- R$ ${vales.toFixed(2)}` : 'R$ 0.00'}
                        </td>
                      </>
                    )}
                    <td className="p-2 text-right font-black border-l border-slate-300 bg-amber-50/70 text-amber-950 tabular-nums whitespace-nowrap">
                      R$ {(tipoValor === 'LIQUIDO' ? aPagar : l.totalValor).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {modoVisao === 'FINANCEIRO' && linhas.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white font-black border-t-2 border-slate-900">
                  <td className="p-2 sticky left-0 bg-slate-900">TOTAL GERAL</td>
                  <td colSpan={diasArray.length} className="p-2 text-right text-[10px] text-slate-300">
                    Valores já descontando pagamentos liquidados e vales do mês
                  </td>
                  <td className="p-2 text-center tabular-nums">
                    {linhas.reduce((s, x) => s + x.totalDias, 0).toFixed(1)}
                  </td>
                  <td className="p-2 text-right text-emerald-300 tabular-nums whitespace-nowrap">
                    R$ {linhas.reduce((s, x) => s + Number(x.totalPago || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-right text-rose-300 tabular-nums whitespace-nowrap">
                    - R$ {linhas.reduce((s, x) => s + Number(x.totalVales || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-right text-amber-300 tabular-nums whitespace-nowrap">
                    R${' '}
                    {(tipoValor === 'LIQUIDO'
                      ? linhas.reduce(
                          (s, x) =>
                            s +
                            (typeof x.saldoAPagar === 'number'
                              ? x.saldoAPagar
                              : Math.max(0, x.totalValor - Number(x.totalPago || 0) - Number(x.totalVales || 0))),
                          0
                        )
                      : linhas.reduce((s, x) => s + x.totalValor, 0)
                    ).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 print:hidden">
          <span className="font-bold text-slate-700">Legenda:</span>
          <span><strong className="text-emerald-700">1</strong> Integral</span>
          <span><strong className="text-amber-700">½</strong> Meio Período</span>
          <span><strong className="text-indigo-700">½+½</strong> Rateio Multi-Obra</span>
          <span>🌧️ Dia de Chuva (R$ 120,00)</span>
          <span>🚗 Viagem</span>
          <span>⛔ Dia Parado</span>
          <span><strong className="text-rose-600">F</strong> Falta</span>
        </div>
      </div>
    </div>
  );
}
