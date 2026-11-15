'use client';

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Check,
  CheckCircle2,
  QrCode,
  Calendar,
  X,
  CreditCard,
  RefreshCw,
  TrendingDown,
  Download,
  Edit2,
  AlertCircle,
} from 'lucide-react';
import { gerarPayloadPix } from '@/lib/pix';
import { ReceiptLightbox } from '@/components/ReceiptLightbox';
import { exportarParaExcel, LinhaBorderoExport } from '@/lib/exportExcel';

interface LinhaLancamento {
  id: string;
  data: string;
  descricao: string;
  tipo: 'PONTO' | 'VALE';
  fracao: number;
  valor: number;
  selecionado: boolean;
  comprovanteUrl?: string | null;
}

interface ExtratoFuncionario {
  id: string;
  nome: string;
  obra: string;
  chavePix: string;
  diariaPadrao: number;
  lancamentos: LinhaLancamento[];
}

export default function BorderoPage() {
  const [funcionarios, setFuncionarios] = useState<ExtratoFuncionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [modalPix, setModalPix] = useState<{ nome: string; valor: number; payload: string; chave: string } | null>(null);
  const [liquidando, setLiquidando] = useState(false);
  const [liquidadoSucesso, setLiquidadoSucesso] = useState(false);
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');

  // Modal para Edição de Lançamento Já Confirmado
  const [edicaoModal, setEdicaoModal] = useState<{
    aberto: boolean;
    lancamentoId: string;
    funcionarioNome: string;
    data: string;
    tipo: 'PONTO' | 'VALE';
    fracao: number;
    valor: number;
    descricao: string;
    salvando: boolean;
    confirmarSobrescrita: boolean;
    conflitoDetectado: boolean;
    mensagemConflito?: string;
  } | null>(null);

  useEffect(() => {
    // Detecta usuário logado
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const nome = decodeURIComponent(userCookie.split('=')[1]);
      if (nome) setUsuarioAtual(nome);
    }
  }, []);

  async function carregarBordero() {
    setLoading(true);
    try {
      const res = await fetch('/api/bordero');
      const data = await res.json();
      setFuncionarios(data.funcionarios || []);
    } catch (e) {
      console.error(e);
      setFuncionarios([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarBordero();
  }, []);

  function toggleItem(funcId: string, lancId: string) {
    setFuncionarios((prev) =>
      prev.map((f) => {
        if (f.id !== funcId) return f;
        return {
          ...f,
          lancamentos: f.lancamentos.map((l) =>
            l.id === lancId ? { ...l, selecionado: !l.selecionado } : l
          ),
        };
      })
    );
  }

  function updatePix(funcId: string, novaChave: string) {
    setFuncionarios((prev) =>
      prev.map((f) => (f.id === funcId ? { ...f, chavePix: novaChave } : f))
    );
  }

  function calcularTotais(f: ExtratoFuncionario) {
    const pontosMarcados = f.lancamentos.filter((l) => l.tipo === 'PONTO' && l.selecionado);
    const valesMarcados = f.lancamentos.filter((l) => l.tipo === 'VALE' && l.selecionado);

    const totalBruto = pontosMarcados.reduce((acc, curr) => acc + curr.valor, 0);
    const totalVales = valesMarcados.reduce((acc, curr) => acc + curr.valor, 0);
    const totalLiquido = Math.max(0, totalBruto - totalVales);
    const totalDiarias = pontosMarcados.reduce((acc, curr) => acc + curr.fracao, 0);

    return { totalBruto, totalVales, totalLiquido, totalDiarias };
  }

  function handleCopiarPix(f: ExtratoFuncionario) {
    const totais = calcularTotais(f);
    const descritivo = `Pgto: ${totais.totalDiarias}d ${f.obra} - Vales R$${totais.totalVales}`;

    const payload = gerarPayloadPix({
      chavePix: f.chavePix,
      nomeRecebedor: f.nome,
      valor: totais.totalLiquido,
      descricao: descritivo,
    });

    navigator.clipboard.writeText(payload);
    setCopiadoId(f.id);
    setTimeout(() => setCopiadoId(null), 3000);
  }

  function handleAbrirModalPix(f: ExtratoFuncionario) {
    const totais = calcularTotais(f);
    const descritivo = `Pgto: ${totais.totalDiarias}d ${f.obra} - Vales R$${totais.totalVales}`;
    const payload = gerarPayloadPix({
      chavePix: f.chavePix,
      nomeRecebedor: f.nome,
      valor: totais.totalLiquido,
      descricao: descritivo,
    });

    setModalPix({
      nome: f.nome,
      valor: totais.totalLiquido,
      payload,
      chave: f.chavePix,
    });
  }

  async function handleLiquidarSemana() {
    setLiquidando(true);
    const idsParaLiquidar: string[] = [];
    funcionarios.forEach((f) => {
      f.lancamentos.forEach((l) => {
        if (l.selecionado) idsParaLiquidar.push(l.id);
      });
    });

    try {
      await fetch('/api/liquidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lancamentosIds: idsParaLiquidar }),
      });

      setLiquidadoSucesso(true);
      setTimeout(() => {
        setFuncionarios((prev) =>
          prev.map((f) => ({
            ...f,
            lancamentos: f.lancamentos.filter((l) => !l.selecionado),
          })).filter((f) => f.lancamentos.length > 0)
        );
        setLiquidadoSucesso(false);
      }, 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setLiquidando(false);
    }
  }

  const totalGeral = funcionarios.reduce((acc, curr) => {
    return acc + calcularTotais(curr).totalLiquido;
  }, 0);

  const totalValesGeral = funcionarios.reduce((acc, curr) => {
    return acc + calcularTotais(curr).totalVales;
  }, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-36">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full w-fit mb-2 border border-amber-200/80 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            <span>Fechamento Semanal de Sexta • Borderô Executivo</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Borderô e Pagamento da Folha
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Selecione as diárias e vales a liquidar hoje. As caixas desmarcadas permanecem salvas para a próxima semana.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              const linhasExport: LinhaBorderoExport[] = funcionarios.map((f) => {
                const totais = calcularTotais(f);
                return {
                  Colaborador: f.nome,
                  Obra: f.obra,
                  'Chave PIX': f.chavePix || 'Não informada',
                  'Diárias Qtd': totais.totalDiarias,
                  'Total Diárias (R$)': totais.totalBruto,
                  'Vales Deduzidos (R$)': totais.totalVales,
                  'Líquido a Pagar (R$)': totais.totalLiquido,
                  Período: 'FECHAMENTO',
                };
              });
              exportarParaExcel(linhasExport, `fechamento-bordero-${new Date().toISOString().split('T')[0]}`);
            }}
            disabled={funcionarios.length === 0}
            className="px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 active:scale-95 disabled:opacity-50"
            title="Exportar borderô para planilha Excel"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Exportar XLS</span>
          </button>

          <button
            onClick={carregarBordero}
            disabled={loading}
            className="p-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl transition-all shadow-sm"
            title="Atualizar borderô"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="bg-white p-3 px-5 rounded-2xl border border-slate-200 shadow-sm text-right">
            <span className="text-[11px] text-slate-400 font-semibold block">Total em Vales Abatidos</span>
            <span className="text-base font-bold text-rose-600">- R$ {totalValesGeral.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {liquidadoSucesso && (
        <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-3xl flex items-center gap-3.5 text-emerald-900 shadow-md">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <h4 className="font-bold text-sm">Semana Liquidada com Sucesso!</h4>
            <p className="text-xs text-emerald-800">
              Os lançamentos selecionados foram alterados para LIQUIDADO no Supabase e arquivados com segurança.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-14 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Buscando lançamentos validados no banco...</p>
        </div>
      ) : funcionarios.length === 0 ? (
        <div className="bg-white p-14 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-3xl flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Nenhum lançamento pronto para liquidação</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Quando você aprovar pontos na tela de <strong>Validações Pendentes</strong>, os extratos dos colaboradores consolidados aparecerão aqui com PIX dinâmico para fechamento.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {funcionarios.map((f) => {
            const totais = calcularTotais(f);

            return (
              <div
                key={f.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                <div className="p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        {f.obra}
                      </span>
                      <span className="text-xs text-slate-400">• Diária base: R$ {f.diariaPadrao.toFixed(2)}</span>
                    </div>
                    <h3 className="text-xl font-black text-white tracking-tight">{f.nome}</h3>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center">
                    <div className="text-right pr-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                        Saldo Líquido
                      </span>
                      <span className="text-2xl font-black text-emerald-400">
                        R$ {totais.totalLiquido.toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleAbrirModalPix(f)}
                      className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl transition-all border border-slate-700 shadow-sm"
                      title="Ver QR Code do PIX"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleCopiarPix(f)}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-2xl transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 active:scale-95"
                    >
                      {copiadoId === f.id ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          <span>Copiar PIX Copia e Cola</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">Chave PIX Cadastrada:</span>
                    <input
                      type="text"
                      value={f.chavePix}
                      onChange={(e) => updatePix(f.id, e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500 w-64 shadow-sm"
                    />
                    <span className="text-slate-400 text-[11px]">(editável para conferência)</span>
                  </div>

                  <div className="text-slate-500 text-[11px]">
                    Clique em qualquer linha para incluir ou retirar da folha de hoje
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <tr>
                        <th className="p-4 w-12 text-center">Liquidar</th>
                        <th className="p-4">Data</th>
                        <th className="p-4">Descrição do Lançamento</th>
                        <th className="p-4">Tipo</th>
                        <th className="p-4 text-center">Anexo/Recibo</th>
                        <th className="p-4 text-right">Fração</th>
                        <th className="p-4 text-right">Valor</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {f.lancamentos.map((l) => (
                        <tr
                          key={l.id}
                          className={`transition-colors ${l.selecionado
                              ? 'bg-white hover:bg-slate-50/80'
                              : 'bg-slate-100/50 text-slate-400 line-through hover:bg-slate-100'
                            }`}
                        >
                          <td
                            className="p-4 text-center cursor-pointer"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            <input
                              type="checkbox"
                              checked={l.selecionado}
                              onChange={() => { }}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td
                            className="p-4 font-semibold text-slate-700 cursor-pointer"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            {l.data}
                          </td>
                          <td
                            className="p-4 font-bold text-slate-900 cursor-pointer"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            {l.descricao}
                          </td>
                          <td
                            className="p-4 cursor-pointer"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${l.tipo === 'PONTO'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/80'
                                }`}
                            >
                              {l.tipo === 'PONTO' ? 'DIÁRIA' : 'VALE DEDUZIDO'}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <ReceiptLightbox
                              comprovanteUrl={l.comprovanteUrl}
                              nomeFuncionario={f.nome}
                              dataReferencia={l.data}
                            />
                          </td>
                          <td
                            className="p-4 text-right font-medium text-slate-600 cursor-pointer"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            {l.tipo === 'PONTO' ? `${l.fracao}x` : '—'}
                          </td>
                          <td
                            className={`p-4 text-right font-black text-sm cursor-pointer ${l.tipo === 'PONTO' ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            {l.tipo === 'PONTO' ? `+ R$ ${l.valor.toFixed(2)}` : `- R$ ${l.valor.toFixed(2)}`}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEdicaoModal({
                                  aberto: true,
                                  lancamentoId: l.id,
                                  funcionarioNome: f.nome,
                                  data: l.data,
                                  tipo: l.tipo,
                                  fracao: l.fracao,
                                  valor: l.valor,
                                  descricao: l.descricao,
                                  salvando: false,
                                  confirmarSobrescrita: false,
                                  conflitoDetectado: false,
                                });
                              }}
                              className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-slate-100 transition-all"
                              title="Editar este registro confirmado"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 px-6 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-4 text-slate-600">
                    <span>
                      Diárias marcadas: <strong className="text-slate-900">{totais.totalDiarias}</strong>
                    </span>
                    <span>
                      Vales a deduzir hoje: <strong className="text-rose-600">R$ {totais.totalVales.toFixed(2)}</strong>
                    </span>
                    {f.lancamentos.some((l) => l.tipo === 'VALE' && !l.selecionado) && (
                      <span className="text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full font-bold border border-amber-200">
                        Saldo a dever postergado: R${' '}
                        {f.lancamentos
                          .filter((l) => l.tipo === 'VALE' && !l.selecionado)
                          .reduce((acc, curr) => acc + curr.valor, 0)
                          .toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-bold text-slate-900">
                    Subtotal a transferir:{' '}
                    <span className="text-emerald-700 font-black text-base ml-1">
                      R$ {totais.totalLiquido.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Bar: Total Geral + Liquidar */}
      {funcionarios.length > 0 && (
        <div className="fixed bottom-0 left-72 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 px-8 py-5 shadow-2xl flex items-center justify-between z-30">
          <div>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
              Total Consolidado para Transferência
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-950">
                R$ {totalGeral.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                (calculado apenas nas caixas selecionadas)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleLiquidarSemana}
              disabled={liquidando || totalGeral === 0}
              className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-black rounded-2xl transition-all shadow-xl shadow-emerald-700/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5 active:scale-95"
            >
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              <span>{liquidando ? 'Liquidando no Banco...' : 'Liquidar e Encerrar Semana'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Edição com Verificação de Conflito e Alerta Patrícia */}
      {edicaoModal && edicaoModal.aberto && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-100 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-base text-slate-900">Editar Registro Confirmado</h3>
              </div>
              <button
                onClick={() => setEdicaoModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aviso se já foi confirmado */}
            {edicaoModal.conflitoDetectado ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Confirmação Prévia Existente</span>
                </div>
                <p className="text-xs text-amber-900 font-semibold leading-relaxed">
                  {edicaoModal.mensagemConflito || 'Este registro já foi confirmado anteriormente. Quer continuar e alterar?'}
                </p>
                <p className="text-[11px] text-amber-800/90 pt-1 border-t border-amber-200/60">
                  ⚠️ <strong>Regra de Governança:</strong> Ao prosseguir, <strong>Patrícia Grubel</strong> receberá imediatamente um alerta com os detalhes da modificação.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-900">
                  {edicaoModal.funcionarioNome} • {edicaoModal.data}
                </div>
                <div className="text-[11px] text-slate-500">
                  Tipo: {edicaoModal.tipo === 'PONTO' ? 'Diária de Campo' : 'Vale Adiantado'}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {edicaoModal.tipo === 'PONTO' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Fração do Dia</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1.0, 0.5, 0.0].map((fr) => (
                      <button
                        key={fr}
                        type="button"
                        onClick={() => {
                          const base = edicaoModal.valor / (edicaoModal.fracao || 1);
                          setEdicaoModal({
                            ...edicaoModal,
                            fracao: fr,
                            valor: base * fr,
                          });
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          edicaoModal.fracao === fr
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {fr === 1 ? '1.0 Integral' : fr === 0.5 ? '0.5 Chuva' : '0.0 Falta'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Valor Monetário (R$)</label>
                <input
                  type="number"
                  step="0.5"
                  value={edicaoModal.valor}
                  onChange={(e) =>
                    setEdicaoModal({ ...edicaoModal, valor: Number(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Motivo / Descrição do Ajuste</label>
                <input
                  type="text"
                  value={edicaoModal.descricao}
                  onChange={(e) =>
                    setEdicaoModal({ ...edicaoModal, descricao: e.target.value })
                  }
                  placeholder="Ex: Ajuste acordado após conferência de chuva"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEdicaoModal(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={edicaoModal.salvando}
                onClick={async () => {
                  setEdicaoModal((prev) => (prev ? { ...prev, salvando: true } : null));
                  try {
                    const res = await fetch('/api/lancamentos/editar', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        lancamentoId: edicaoModal.lancamentoId,
                        novaFracao: edicaoModal.fracao,
                        novoValor: edicaoModal.valor,
                        novaObservacao: edicaoModal.descricao,
                        usuarioLogado: usuarioAtual,
                        confirmarSobrescrita: edicaoModal.confirmarSobrescrita,
                      }),
                    });

                    const data = await res.json();

                    // Se detectou conflito e ainda não havia confirmado
                    if (res.status === 409 && data.conflito) {
                      setEdicaoModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              salvando: false,
                              conflitoDetectado: true,
                              confirmarSobrescrita: true,
                              mensagemConflito: data.mensagem,
                            }
                          : null
                      );
                      return;
                    }

                    if (data.success) {
                      setEdicaoModal(null);
                      carregarBordero();
                    } else {
                      alert(data.error || 'Erro ao editar lançamento');
                      setEdicaoModal((prev) => (prev ? { ...prev, salvando: false } : null));
                    }
                  } catch (err) {
                    console.error(err);
                    setEdicaoModal((prev) => (prev ? { ...prev, salvando: false } : null));
                  }
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-2 ${
                  edicaoModal.conflitoDetectado
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <span>
                  {edicaoModal.salvando
                    ? 'Salvando...'
                    : edicaoModal.conflitoDetectado
                    ? 'Confirmar e Notificar Patrícia'
                    : 'Salvar Alteração'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal PIX QR Code & String Preview */}
      {modalPix && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-base text-slate-900">PIX Dinâmico</h3>
              </div>
              <button
                onClick={() => setModalPix(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center space-y-1">
              <span className="text-xs text-slate-400 font-medium">Beneficiário</span>
              <h4 className="text-lg font-black text-slate-900">{modalPix.nome}</h4>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                R$ {modalPix.valor.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">Chave: {modalPix.chave}</div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Código BR Code (Copia e Cola):
              </span>
              <p className="text-xs text-slate-700 font-mono break-all line-clamp-3 select-all bg-white p-2.5 rounded-xl border border-slate-200">
                {modalPix.payload}
              </p>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(modalPix.payload);
                setModalPix(null);
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Copiar Código e Fechar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
