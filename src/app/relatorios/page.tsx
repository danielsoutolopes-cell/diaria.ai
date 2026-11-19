'use client';

import React, { useState, useEffect } from 'react';
import EspelhoPontoMensal from '@/components/EspelhoPontoMensal';
import CalendarioVisualObra from '@/components/CalendarioVisualObra';
import {
  BarChart3,
  Calendar,
  FileSpreadsheet,
  Share2,
  Building2,
  Users,
  TrendingDown,
  TrendingUp,
  Download,
  Send,
  RefreshCw,
  CreditCard,
  MessageCircle,
  HardHat,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import { exportarParaExcel, LinhaBorderoExport, LinhaCustoObraExport, LinhaExtratoAnaliticoExport } from '@/lib/exportExcel';
import CalendarioValesCaixa from '@/components/CalendarioValesCaixa';

interface BorderoItem {
  nome: string;
  obra: string;
  chavePix: string;
  telefone: string | null;
  totalDiariasQtd: number;
  totalDiariasValor: number;
  totalValesValor: number;
  liquidoPagar: number;
  itens: any[];
}

interface CustoObraItem {
  nomeObra: string;
  tipoObra: string;
  totalDiarias: number;
  totalVales: number;
  totalGeral: number;
  qtdTrabalhadores: number;
}

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<'semanal' | 'quinzenal' | 'mensal'>('semanal');
  const [loading, setLoading] = useState(true);
  const [dadosBordero, setDadosBordero] = useState<BorderoItem[]>([]);
  const [dadosObras, setDadosObras] = useState<CustoObraItem[]>([]);
  const [lancamentosDetalhados, setLancamentosDetalhados] = useState<any[]>([]);
  const [modalExtrato, setModalExtrato] = useState<BorderoItem | null>(null);
  const [excluindoItemId, setExcluindoItemId] = useState<string | null>(null);
  const [buscaBordero, setBuscaBordero] = useState<string>('');
  const [totais, setTotais] = useState({
    totalGeralDiarias: 0,
    totalGeralVales: 0,
    totalLiquido: 0,
    totalTrabalhadores: 0,
    totalObras: 0,
  });

  async function carregarRelatorios() {
    setLoading(true);
    try {
      const res = await fetch(`/api/relatorios?periodo=${periodo}`);
      const data = await res.json();
      if (data && !data.error) {
        setDadosBordero(data.borderoConsolidado || []);
        setDadosObras(data.custoPorObra || []);
        setLancamentosDetalhados(data.lancamentosDetalhados || []);
        setTotais(data.totais || {
          totalGeralDiarias: 0,
          totalGeralVales: 0,
          totalLiquido: 0,
          totalTrabalhadores: 0,
          totalObras: 0,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarRelatorios();
  }, [periodo]);

  // Exportar Borderô Consolidado para XLS
  function handleExportarBorderoXls() {
    const linhas: LinhaBorderoExport[] = dadosBordero.map((b) => ({
      Colaborador: b.nome,
      Obra: b.obra,
      'Chave PIX': b.chavePix || 'Não informada',
      'Diárias Qtd': b.totalDiariasQtd,
      'Total Diárias (R$)': b.totalDiariasValor,
      'Vales Deduzidos (R$)': b.totalValesValor,
      'Líquido a Pagar (R$)': b.liquidoPagar,
      Período: periodo.toUpperCase(),
    }));

    exportarParaExcel(linhas, `bordero-${periodo}-${new Date().toISOString().split('T')[0]}`, 'Borderô Consolidado');
  }

  // Exportar Custo por Canteiro para XLS
  function handleExportarObrasXls() {
    const linhas: LinhaCustoObraExport[] = dadosObras.map((o) => ({
      Obra: o.nomeObra,
      Tipo: o.tipoObra === 'PISCINA' ? 'Piscina' : 'Obra Civil',
      'Total Diárias': o.totalDiarias,
      'Total Vales': o.totalVales,
      'Total Geral (R$)': o.totalGeral,
      'Qtd Trabalhadores': o.qtdTrabalhadores,
    }));

    exportarParaExcel(linhas, `custo-obras-${periodo}-${new Date().toISOString().split('T')[0]}`, 'Custos por Canteiro');
  }

  // Exportar Extrato Detalhado para XLS
  function handleExportarAnaliticoXls() {
    const linhas: LinhaExtratoAnaliticoExport[] = lancamentosDetalhados.map((l) => ({
      Data: l.data_referencia,
      Colaborador: l.nome_trabalhador,
      Obra: l.obras_config?.nome || 'Geral',
      Tipo: l.tipo_lancamento === 'PONTO' ? 'Diária' : 'Vale',
      'Fração / Qtd': l.tipo_lancamento === 'PONTO' ? `${l.fracao_dia || 1}x` : '—',
      'Valor (R$)': Number(l.valor_monetario || 0),
      Status: l.status,
      'Chave PIX': l.comprovante_url ? 'Comprovante em Anexo' : '—',
    }));

    exportarParaExcel(linhas, `extrato-analitico-${periodo}-${new Date().toISOString().split('T')[0]}`, 'Extrato Analítico');
  }

  // Disparo de Resumo do Borderô via WhatsApp para a Diretoria / Patrícia
  function handleEnviarWhatsappDiretoria() {
    const tituloPeriodo =
      periodo === 'semanal' ? 'Semanal' : periodo === 'quinzenal' ? 'Quinzenal' : 'Mensal';

    let mensagem = `*📊 RELATÓRIO CONSOLIDADO DE FECHAMENTO (${tituloPeriodo.toUpperCase()})*\n`;
    mensagem += `*Ponto Patrícia (Diária.AI)*\n`;
    mensagem += `--------------------------------------\n`;
    mensagem += `👥 *Total de Trabalhadores:* ${totais.totalTrabalhadores}\n`;
    mensagem += `🏗️ *Canteiros Ativos:* ${totais.totalObras}\n`;
    mensagem += `💰 *Bruto em Diárias:* R$ ${totais.totalGeralDiarias.toFixed(2)}\n`;
    mensagem += `📉 *Vales Deduzidos:* R$ ${totais.totalGeralVales.toFixed(2)}\n`;
    mensagem += `✅ *TOTAL LÍQUIDO A PAGAR:* R$ ${totais.totalLiquido.toFixed(2)}\n`;
    mensagem += `--------------------------------------\n\n`;
    mensagem += `*Detalhamento por Colaborador:*\n`;

    dadosBordero.forEach((f, idx) => {
      mensagem += `${idx + 1}. *${f.nome}* (${f.obra})\n`;
      mensagem += `   • Diárias: ${f.totalDiariasQtd}x (R$ ${f.totalDiariasValor.toFixed(2)})\n`;
      if (f.totalValesValor > 0) {
        mensagem += `   • Vales: -R$ ${f.totalValesValor.toFixed(2)}\n`;
      }
      mensagem += `   • *Líquido:* R$ ${f.liquidoPagar.toFixed(2)} | PIX: ${f.chavePix || 'Pendente'}\n\n`;
    });

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  }

  // Disparo de Extrato Individual para o Trabalhador
  function handleEnviarExtratoTrabalhador(item: BorderoItem) {
    let mensagem = `Olá, *${item.nome}*! 👋\n`;
    mensagem += `Segue o demonstrativo de seu pagamento (${periodo.toUpperCase()}) - *Ponto Patrícia*:\n\n`;
    mensagem += `🏗️ *Obra:* ${item.obra}\n`;
    mensagem += `📅 *Diárias registradas:* ${item.totalDiariasQtd}x (R$ ${item.totalDiariasValor.toFixed(2)})\n`;
    if (item.totalValesValor > 0) {
      mensagem += `🧾 *Vales deduzidos:* -R$ ${item.totalValesValor.toFixed(2)}\n`;
    }
    mensagem += `💵 *VALOR LÍQUIDO A RECEBER:* R$ ${item.liquidoPagar.toFixed(2)}\n`;
    mensagem += `🔑 *Chave PIX:* ${item.chavePix || 'Conferir com o administrativo'}\n\n`;
    mensagem += `_Mensagem automática gerada pelo sistema Ponto Patrícia._`;

    const telefoneLimpo = item.telefone ? item.telefone.replace(/\D/g, '') : '';
    const linkWa = telefoneLimpo
      ? `https://api.whatsapp.com/send?phone=55${telefoneLimpo}&text=${encodeURIComponent(mensagem)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`;

    window.open(linkWa, '_blank');
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Controladoria & Fechamento
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 mt-1">Relatórios & Exportações</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Demonstrativos consolidados com exportação direta para Excel (.xlsx) e disparo executivo via WhatsApp.
          </p>
        </div>

        {/* Filtro de Período + Disparo WhatsApp Master */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor Semanal / Quinzenal / Mensal */}
          <div className="flex items-center bg-slate-200/80 p-1.5 rounded-2xl gap-1">
            <button
              onClick={() => setPeriodo('semanal')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                periodo === 'semanal'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Semanal
            </button>
            <button
              onClick={() => setPeriodo('quinzenal')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                periodo === 'quinzenal'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Quinzenal
            </button>
            <button
              onClick={() => setPeriodo('mensal')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                periodo === 'mensal'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Mensal
            </button>
          </div>

          {/* Enviar Resumo WhatsApp para Diretoria */}
          <button
            onClick={handleEnviarWhatsappDiretoria}
            disabled={dadosBordero.length === 0}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-700/20 active:scale-95 transition-all disabled:opacity-50"
            title="Enviar resumo executivo consolidado via WhatsApp"
          >
            <Share2 className="w-4 h-4" />
            <span>Enviar no WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas do Período */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total em Diárias (Bruto)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-950">
            R$ {totais.totalGeralDiarias.toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400">Total apurado no período {periodo}</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Vales Deduzidos</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600">
            - R$ {totais.totalGeralVales.toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400">Abatimentos e adiantamentos de campo</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total Líquido a Pagar</span>
            <Receipt className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">
            R$ {totais.totalLiquido.toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400">Volume financeiro a liquidar via PIX</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Colaboradores / Canteiros</span>
            <Users className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black text-slate-950">
            {totais.totalTrabalhadores} <span className="text-sm font-semibold text-slate-400">em {totais.totalObras} obras</span>
          </div>
          <p className="text-[11px] text-slate-400">Mão de obra ativa com lançamentos</p>
        </div>
      </div>

      {/* ================= RELATÓRIO 1: BORDERÔ CONSOLIDADO ================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Relatório 1
              </span>
              <h2 className="text-lg font-black text-white">Borderô Consolidado ({periodo.toUpperCase()})</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Extrato consolidado por trabalhador com diárias, vales, saldo líquido e chave PIX para conferência.
            </p>
          </div>

          <button
            onClick={handleExportarBorderoXls}
            disabled={dadosBordero.length === 0}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 border border-white/20 disabled:opacity-40"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar Excel (.xlsx)</span>
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            <div className="h-10 bg-slate-100 rounded-xl" />
            <div className="h-12 bg-slate-50 rounded-xl" />
            <div className="h-12 bg-slate-50 rounded-xl" />
            <div className="h-12 bg-slate-50 rounded-xl" />
          </div>
        ) : dadosBordero.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            Nenhum lançamento encontrado para o período {periodo}.
          </div>
        ) : (() => {
          const termo = buscaBordero.trim().toLowerCase();
          const filtradosBordero = termo
            ? dadosBordero.filter(
                (it) =>
                  it.nome.toLowerCase().includes(termo) ||
                  it.obra.toLowerCase().includes(termo)
              )
            : dadosBordero;

          return (
            <div>
              {/* Barra de Busca & Contagem (UX/UI SaaS Seção 3.2) */}
              <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
                  <input
                    type="text"
                    value={buscaBordero}
                    onChange={(e) => setBuscaBordero(e.target.value)}
                    placeholder="Filtrar por colaborador ou obra..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  {buscaBordero && (
                    <button
                      type="button"
                      onClick={() => setBuscaBordero('')}
                      className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-600 shrink-0"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                  Mostrando {filtradosBordero.length} de {dadosBordero.length} colaborador(es)
                </span>
              </div>

              {filtradosBordero.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    Nenhum resultado encontrado para <strong>&quot;{buscaBordero}&quot;</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBuscaBordero('')}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold"
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold shadow-xs">
                      <tr>
                        <th className="p-4">Colaborador</th>
                        <th className="p-4">Canteiro Principal</th>
                        <th className="p-4">Chave PIX</th>
                        <th className="p-4 text-right">Diárias</th>
                        <th className="p-4 text-right">Bruto</th>
                        <th className="p-4 text-right">Vales</th>
                        <th className="p-4 text-right">Líquido a Pagar</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtradosBordero.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-4 font-bold text-slate-950">
                            <button
                              type="button"
                              onClick={() => setModalExtrato(item)}
                              className="text-left hover:text-emerald-700 hover:underline flex items-center gap-1.5 transition-colors"
                              title="Clique para ver o extrato dia a dia e remover duplicidades"
                            >
                              <span>{item.nome}</span>
                            </button>
                          </td>
                          <td className="p-4 text-slate-600">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                              {item.obra}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-[11px] text-slate-600">
                            {item.chavePix || <span className="text-amber-600 italic">Não informada</span>}
                          </td>
                          <td className="p-4 text-right font-bold text-slate-800 tabular-nums">{item.totalDiariasQtd}x</td>
                          <td className="p-4 text-right font-medium text-slate-700 tabular-nums">
                            R$ {item.totalDiariasValor.toFixed(2)}
                          </td>
                          <td className="p-4 text-right font-bold text-rose-600 tabular-nums">
                            {item.totalValesValor > 0 ? `- R$ ${item.totalValesValor.toFixed(2)}` : '—'}
                          </td>
                          <td className="p-4 text-right font-black text-sm text-emerald-700 tabular-nums">
                            R$ {item.liquidoPagar.toFixed(2)}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleEnviarExtratoTrabalhador(item)}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                              title="Enviar extrato individual via WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ================= RELATÓRIO 2: CUSTO POR CANTEIRO / OBRA ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 border border-amber-500/30">
                  Relatório 2
                </span>
                <h3 className="font-black text-base text-slate-950">Custo de Mão de Obra por Canteiro</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Investimento acumulado por obra para controle de margem e orçamentos.
              </p>
            </div>

            <button
              onClick={handleExportarObrasXls}
              disabled={dadosObras.length === 0}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
              title="Baixar planilha de obras"
            >
              <Download className="w-3.5 h-3.5" />
              <span>XLS</span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
            </div>
          ) : dadosObras.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Nenhuma obra computada no período.</p>
          ) : (
            <div className="space-y-3">
              {dadosObras.map((o, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-sm">{o.nomeObra}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-bold">
                        {o.tipoObra === 'PISCINA' ? 'Piscina' : 'Obra Civil'}
                      </span>
                    </div>
                    <span className="text-slate-500 text-[11px] block">
                      {o.qtdTrabalhadores} trabalhador(es) alocado(s)
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Total Gasto</span>
                    <span className="font-black text-slate-950 text-sm">
                      R$ {o.totalGeral.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ================= RELATÓRIO 3: EXTRATO ANALÍTICO / AUDITORIA ================= */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-800 border border-sky-500/30">
                  Relatório 3
                </span>
                <h3 className="font-black text-base text-slate-950">Extrato Analítico (Auditoria)</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Exportação de todos os registros linha a linha para conferência e compliance contábil.
              </p>
            </div>

            <button
              onClick={handleExportarAnaliticoXls}
              disabled={lancamentosDetalhados.length === 0}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
              title="Baixar extrato analítico em Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>XLS</span>
            </button>
          </div>

          <div className="bg-gradient-to-br from-slate-950 to-slate-900 text-white p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Total de Linhas Auditadas</span>
              <span className="text-emerald-400 font-bold text-xs">{lancamentosDetalhados.length} lançamentos</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              O arquivo analítico inclui o registro temporal exato, fracionamento de diárias (1x, 0.5x), status de aprovação pela administradora e indicação de fotos de recibos no Cloudflare R2.
            </p>
            <button
              onClick={handleExportarAnaliticoXls}
              disabled={lancamentosDetalhados.length === 0}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Baixar Planilha Completa (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= RELATÓRIO 4: ESPELHO DO PONTO (CALENDÁRIO PAISAGEM) ================= */}
      <EspelhoPontoMensal />

      {/* ================= RELATÓRIO 5: CALENDÁRIO VISUAL DE OBRA & CLIMA ================= */}
      <CalendarioVisualObra />

      {/* ================= RELATÓRIO 6: CALENDÁRIO DE VALES, REEMBOLSOS & CAIXA DE CAMPO ================= */}
      <CalendarioValesCaixa />

      {/* ================= MODAL DE EXTRATO DETALHADO DO COLABORADOR ================= */}
      {modalExtrato && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-950">{modalExtrato.nome}</h3>
                <p className="text-xs text-slate-500">
                  Extrato individual dia a dia • PIX: <span className="font-mono">{modalExtrato.chavePix || 'Não informada'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalExtrato(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {lancamentosDetalhados
                .filter((l) => l.nome_trabalhador?.trim().toLowerCase() === modalExtrato.nome.trim().toLowerCase())
                .map((l) => (
                  <div key={l.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">{l.data_referencia}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                          {(l.obras_config as any)?.nome || 'Geral'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            l.tipo_lancamento === 'VALE'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {l.tipo_lancamento} ({l.fracao_dia || 1}x)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{l.observacao || 'Apontamento de campo'}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-black text-sm text-slate-900">
                        R$ {Number(l.valor_monetario || 0).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        disabled={excluindoItemId === l.id}
                        onClick={async () => {
                          setExcluindoItemId(l.id);
                          try {
                            const res = await fetch('/api/lancamentos/excluir', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ lancamentoId: l.id }),
                            });
                            if (res.ok) {
                              await carregarRelatorios();
                              setModalExtrato(null);
                            }
                          } finally {
                            setExcluindoItemId(null);
                          }
                        }}
                        className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-lg font-bold text-[11px] border border-rose-200/70 transition-all"
                      >
                        {excluindoItemId === l.id ? '...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

