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
  Clock,
  FileText,
  ExternalLink,
  Activity,
} from 'lucide-react';
import {
  exportarParaExcel,
  exportarExtratoAnalitico5AbasV6,
  type ExtratoAnaliticoV6Payload,
  type LinhaBorderoExport,
  type LinhaCustoObraExport,
  type LinhaExtratoAnaliticoExport,
} from '@/lib/exportExcel';
import CalendarioValesCaixa from '@/components/CalendarioValesCaixa';
import SaudeSistemaPanel from '@/components/SaudeSistemaPanel';

interface ObraResumoRel {
  nome?: string | null;
  tipo_obra?: string | null;
}

interface LancamentoDetalhadoItem {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia?: number | string | null;
  valor_monetario?: number | string | null;
  status: string;
  data_referencia: string;
  observacao?: string | null;
  comprovante_url?: string | null;
  obras_config?: ObraResumoRel | ObraResumoRel[] | null;
}

interface BorderoItem {
  nome: string;
  obra: string;
  chavePix: string;
  telefone: string | null;
  totalDiariasQtd: number;
  totalDiariasValor: number;
  totalValesValor: number;
  liquidoPagar: number;
  itens: LancamentoDetalhadoItem[];
}

interface CustoObraItem {
  nomeObra: string;
  tipoObra: string;
  totalDiarias: number;
  totalVales: number;
  totalGeral: number;
  qtdTrabalhadores: number;
}

interface CronQuinzenalStatus {
  regraAgendamento: string;
  proximaJanela: string;
  destinatarios: Array<{ nome: string; telefone: string }>;
  ultimoDisparo: {
    dataIso: string;
    disparadoEm: string;
    arquivoNome: string;
    reciboR2Url: string | null;
    totalLiquidoAberto: number;
    destinatarios: Array<{
      nome: string;
      telefone: string;
      enviado: boolean;
      modo: string;
      erro?: string;
    }>;
  } | null;
}

function extrairNomeObraRel(
  obrasConfig: ObraResumoRel | ObraResumoRel[] | null | undefined
): string {
  if (!obrasConfig) return 'Geral';
  if (Array.isArray(obrasConfig)) return obrasConfig[0]?.nome || 'Geral';
  return obrasConfig.nome || 'Geral';
}

export default function RelatoriosPage() {
  const [abaAtiva, setAbaAtiva] = useState<'relatorios' | 'saude'>('relatorios');
  const [resumoSaude, setResumoSaude] = useState<{
    scoreGeral: number;
    anomaliasAlta: number;
    nivel: string;
  } | null>(null);
  const [periodo, setPeriodo] = useState<'semanal' | 'quinzenal' | 'mensal'>('semanal');
  const [loading, setLoading] = useState(true);
  const [dadosBordero, setDadosBordero] = useState<BorderoItem[]>([]);
  const [dadosObras, setDadosObras] = useState<CustoObraItem[]>([]);
  const [lancamentosDetalhados, setLancamentosDetalhados] = useState<LancamentoDetalhadoItem[]>([]);
  const [modalExtrato, setModalExtrato] = useState<BorderoItem | null>(null);
  const [excluindoItemId, setExcluindoItemId] = useState<string | null>(null);
  const [buscaBordero, setBuscaBordero] = useState<string>('');
  const [exportandoExcelV6, setExportandoExcelV6] = useState<boolean>(false);
  const [cronStatus, setCronStatus] = useState<CronQuinzenalStatus | null>(null);
  const [disparandoQuinzenal, setDisparandoQuinzenal] = useState<boolean>(false);
  const [feedbackAcao, setFeedbackAcao] = useState<{
    tipo: 'sucesso' | 'erro';
    mensagem: string;
    linkR2?: string | null;
  } | null>(null);
  const [totais, setTotais] = useState({
    totalGeralDiarias: 0,
    totalGeralVales: 0,
    totalLiquido: 0,
    totalTrabalhadores: 0,
    totalObras: 0,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('aba') === 'saude') {
        setAbaAtiva('saude');
      }
    }
    fetch('/api/auditoria?periodo=15d', { cache: 'no-store' })
      .then((r) => r.json())
      .then(
        (d: {
          success?: boolean;
          saudeSistema?: { scoreGeral: number; nivel: string };
          simulacao?: { anomaliasAlta: number };
        }) => {
          if (d.success && d.saudeSistema) {
            setResumoSaude({
              scoreGeral: d.saudeSistema.scoreGeral,
              anomaliasAlta: d.simulacao?.anomaliasAlta || 0,
              nivel: d.saudeSistema.nivel,
            });
          }
        }
      )
      .catch(() => {});
  }, []);

  async function carregarStatusCron() {
    try {
      const res = await fetch('/api/cron/relatorio-quinzenal');
      const data = (await res.json()) as CronQuinzenalStatus & { error?: string };
      if (res.ok && !data.error) {
        setCronStatus(data);
      }
    } catch {
      // Silencioso
    }
  }

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
    void carregarRelatorios();
  }, [periodo]);

  useEffect(() => {
    void carregarStatusCron();
  }, []);

  // Prompt 6: Exportar Extrato Analítico Excel em 5 Abas Inteligentes (V6) com Fórmulas =SUM(...)
  async function handleExportarExcel5AbasV6() {
    setExportandoExcelV6(true);
    setFeedbackAcao(null);
    try {
      const res = await fetch(`/api/relatorios/excel-v6?periodo=${periodo}`);
      const data = (await res.json()) as {
        success?: boolean;
        payload?: ExtratoAnaliticoV6Payload;
        error?: string;
      };
      if (!res.ok || !data.payload) {
        setFeedbackAcao({
          tipo: 'erro',
          mensagem: data.error || 'Falha ao montar planilha Excel V6.',
        });
        return;
      }
      const hoje = new Date().toISOString().split('T')[0];
      exportarExtratoAnalitico5AbasV6(
        data.payload,
        `extrato-analitico-5-abas-v6-${periodo}-${hoje}`
      );
      setFeedbackAcao({
        tipo: 'sucesso',
        mensagem:
          'Planilha Excel V6 (5 abas com fórmulas =SUM) gerada e baixada com sucesso!',
      });
    } catch (err: unknown) {
      setFeedbackAcao({
        tipo: 'erro',
        mensagem:
          err instanceof Error
            ? err.message
            : 'Erro ao exportar Excel V6 (5 abas).',
      });
    } finally {
      setExportandoExcelV6(false);
    }
  }

  // Prompt 5: Disparo manual/imediato do Relatório Financeiro Quinzenal em PDF Paisagem (Base64)
  async function handleDispararPdfQuinzenalAgora() {
    setDisparandoQuinzenal(true);
    setFeedbackAcao(null);
    try {
      const res = await fetch('/api/cron/relatorio-quinzenal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        fileName?: string;
        pdfBase64?: string;
        reciboR2Url?: string | null;
        resumo?: string;
        destinatarios?: Array<{ nome: string; enviado: boolean; modo: string }>;
        error?: string;
      };

      if (!res.ok || !data.success) {
        setFeedbackAcao({
          tipo: 'erro',
          mensagem: data.error || 'Falha ao gerar PDF quinzenal.',
        });
        return;
      }

      // Garante download local imediato do PDF Paisagem em Base64
      if (data.pdfBase64) {
        const bytes = Uint8Array.from(atob(data.pdfBase64), (c) =>
          c.charCodeAt(0)
        );
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName || 'relatorio-financeiro-quinzenal.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }

      const enviados = (data.destinatarios || []).filter((d) => d.enviado).length;
      const totalDest = (data.destinatarios || []).length;
      setFeedbackAcao({
        tipo: 'sucesso',
        mensagem:
          enviados > 0
            ? `PDF Paisagem gerado (${data.resumo}) e enviado via WhatsApp para ${enviados}/${totalDest} destinatários oficiais.`
            : `PDF Paisagem gerado e baixado (${data.resumo}). WhatsApp offline no momento — cópia salva no R2.`,
        linkR2: data.reciboR2Url,
      });
      await carregarStatusCron();
    } catch (err: unknown) {
      setFeedbackAcao({
        tipo: 'erro',
        mensagem:
          err instanceof Error
            ? err.message
            : 'Erro ao disparar relatório quinzenal.',
      });
    } finally {
      setDisparandoQuinzenal(false);
    }
  }

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

  // Exportar Extrato Analítico Completo em 5 Abas Inteligentes (V6) com Fórmulas =SUM(...)
  function handleExportarAnaliticoXls() {
    void handleExportarExcel5AbasV6();
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* Navegação por Abas: Relatórios & Exportações | Saúde do Sistema & IA */}
      <div
        role="tablist"
        aria-label="Abas de Relatórios e Saúde do Sistema"
        className="grid grid-cols-2 sm:inline-flex items-center bg-slate-200/80 p-1.5 rounded-2xl gap-1.5 w-full sm:w-auto"
      >
        <button
          type="button"
          role="tab"
          aria-selected={abaAtiva === 'relatorios'}
          onClick={() => setAbaAtiva('relatorios')}
          className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
            abaAtiva === 'relatorios'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-950'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span className="truncate">Relatórios</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={abaAtiva === 'saude'}
          onClick={() => setAbaAtiva('saude')}
          className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
            abaAtiva === 'saude'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-700 hover:text-slate-950'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0 text-emerald-500" />
          <span className="truncate">Saúde &amp; IA</span>
          {resumoSaude && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums border ${
                resumoSaude.anomaliasAlta > 0 || resumoSaude.scoreGeral < 60
                  ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                  : resumoSaude.scoreGeral < 85
                  ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
              }`}
              title={`Health Score: ${resumoSaude.scoreGeral}/100 (${resumoSaude.nivel})`}
            >
              {resumoSaude.scoreGeral}
            </span>
          )}
        </button>
      </div>

      {abaAtiva === 'saude' ? (
        <SaudeSistemaPanel
          embutidoEmRelatorios
          onScoreCarregado={(info) => setResumoSaude(info)}
        />
      ) : (
        <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5 border-b border-slate-200 pb-5 sm:pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Controladoria & Fechamento
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 mt-1">Relatórios & Exportações</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Demonstrativos consolidados com exportação direta para Excel (.xlsx) e disparo executivo via WhatsApp.
          </p>
        </div>

        {/* Filtro de Período + Disparo WhatsApp Master */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
          {/* Seletor Semanal / Quinzenal / Mensal */}
          <div className="grid grid-cols-3 sm:flex items-center bg-slate-200/80 p-1.5 rounded-2xl gap-1 w-full sm:w-auto">
            <button
              onClick={() => setPeriodo('semanal')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all text-center ${
                periodo === 'semanal'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Semanal
            </button>
            <button
              onClick={() => setPeriodo('quinzenal')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all text-center ${
                periodo === 'quinzenal'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Quinzenal
            </button>
            <button
              onClick={() => setPeriodo('mensal')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all text-center ${
                periodo === 'mensal'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Mensal
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            {/* Excel V6 — 5 Abas Inteligentes com Fórmulas =SUM(...) */}
            <button
              type="button"
              onClick={() => void handleExportarExcel5AbasV6()}
              disabled={exportandoExcelV6}
              className="px-3 sm:px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50"
              title="Baixar planilha Excel V6 em 5 abas inteligentes com fórmulas =SUM nativas"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {exportandoExcelV6 ? 'Gerando...' : 'Excel (5 Abas)'}
              </span>
            </button>

            {/* Enviar Resumo WhatsApp para Diretoria */}
            <button
              onClick={handleEnviarWhatsappDiretoria}
              disabled={dadosBordero.length === 0}
              className="px-3 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 shadow-md shadow-emerald-700/20 active:scale-95 transition-all disabled:opacity-50"
              title="Enviar resumo executivo consolidado via WhatsApp"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback de Exportação / Disparo */}
      {feedbackAcao && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex flex-wrap items-center justify-between gap-3 ${
            feedbackAcao.tipo === 'sucesso'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackAcao.mensagem}</span>
          </div>
          <div className="flex items-center gap-3">
            {feedbackAcao.linkR2 && (
              <a
                href={feedbackAcao.linkR2}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline font-black text-emerald-700 hover:text-emerald-900"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir PDF no R2</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setFeedbackAcao(null)}
              className="text-[11px] opacity-70 hover:opacity-100"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Faixa de Automação Quinzenal (Prompt 5: PDF Paisagem Base64 — 2ª e última sexta 18:00 BRT) */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-black">
              <Clock className="w-3.5 h-3.5" />
              <span>Agendamento Quinzenal Automático</span>
            </span>
            <span className="text-xs font-bold text-slate-600">
              {cronStatus?.regraAgendamento ||
                '2ª e última sexta-feira do mês às 18:00 (America/Sao_Paulo)'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Próximo disparo automático:{' '}
            <strong className="text-slate-900">
              {cronStatus?.proximaJanela || 'Calculando...'}
            </strong>{' '}
            • Destinatários sigilosos:{' '}
            <strong className="text-slate-800">
              {(cronStatus?.destinatarios || [
                { nome: 'Daniel Lopes' },
                { nome: 'Patrícia Grubel' },
              ])
                .map((d) => d.nome)
                .join(' e ')}
            </strong>{' '}
            (PDF Paisagem em Base64 somente com saldos em aberto + Caixinha em coluna informativa).
          </p>
          {cronStatus?.ultimoDisparo && (
            <p className="text-[11px] text-slate-500">
              Último envio registrado em{' '}
              <strong className="text-slate-800">
                {new Date(cronStatus.ultimoDisparo.disparadoEm).toLocaleString(
                  'pt-BR'
                )}
              </strong>{' '}
              • Líquido em aberto:{' '}
              <strong className="text-emerald-700 tabular-nums">
                R$ {Number(cronStatus.ultimoDisparo.totalLiquidoAberto || 0).toFixed(2)}
              </strong>
              {cronStatus.ultimoDisparo.reciboR2Url && (
                <>
                  {' '}
                  •{' '}
                  <a
                    href={cronStatus.ultimoDisparo.reciboR2Url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-bold text-indigo-700"
                  >
                    PDF arquivado no R2
                  </a>
                </>
              )}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleDispararPdfQuinzenalAgora()}
          disabled={disparandoQuinzenal}
          className="w-full lg:w-auto px-4 py-3 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50 shrink-0"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>
            {disparandoQuinzenal
              ? 'Gerando e Enviando PDF...'
              : 'Disparar PDF Quinzenal Agora'}
          </span>
        </button>
      </div>

      {/* Cards de Métricas do Período (2x2 compacto no celular em pé) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-[11px] sm:text-xs font-semibold gap-1">
            <span>Diárias (Bruto)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-slate-950 tabular-nums">
            R$ {totais.totalGeralDiarias.toFixed(2)}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400">Período {periodo}</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-[11px] sm:text-xs font-semibold gap-1">
            <span>Vales Deduzidos</span>
            <TrendingDown className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-rose-600 tabular-nums">
            - R$ {totais.totalGeralVales.toFixed(2)}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400">Adiantamentos de campo</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-[11px] sm:text-xs font-semibold gap-1">
            <span>Líquido a Pagar</span>
            <Receipt className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-emerald-700 tabular-nums">
            R$ {totais.totalLiquido.toFixed(2)}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400">Volume via PIX</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-[11px] sm:text-xs font-semibold gap-1">
            <span>Equipe / Obras</span>
            <Users className="w-4 h-4 text-sky-500 shrink-0" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-slate-950 tabular-nums">
            {totais.totalTrabalhadores}{' '}
            <span className="text-xs sm:text-sm font-semibold text-slate-400">em {totais.totalObras} obras</span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400">Mão de obra ativa</p>
        </div>
      </div>

      {/* ================= RELATÓRIO 1: BORDERÔ CONSOLIDADO ================= */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Relatório 1
              </span>
              <h2 className="text-base sm:text-lg font-black text-white">Borderô Consolidado ({periodo.toUpperCase()})</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Extrato consolidado por trabalhador com diárias, vales, saldo líquido e chave PIX para conferência.
            </p>
          </div>

          <button
            onClick={handleExportarBorderoXls}
            disabled={dadosBordero.length === 0}
            className="w-full sm:w-auto justify-center px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 border border-white/20 disabled:opacity-40"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar Excel (.xlsx)</span>
          </button>
        </div>

        {loading ? (
          <div className="p-4 sm:p-6 space-y-3 animate-pulse">
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
              <div className="px-4 sm:px-6 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2 flex-1 w-full sm:max-w-md">
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
                <>
                  {/* Visão Mobile Retrato: Cards Empilhados de Leitura Rápida */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {filtradosBordero.map((item, idx) => (
                      <div
                        key={`mob-${idx}`}
                        className="p-4 space-y-3 bg-white active:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <button
                              type="button"
                              onClick={() => setModalExtrato(item)}
                              className="text-left font-black text-sm text-slate-950 hover:text-emerald-700 underline decoration-emerald-300 underline-offset-2"
                            >
                              {item.nome}
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-700">
                                {item.obra}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 truncate max-w-[180px]">
                                {item.chavePix ? `PIX: ${item.chavePix}` : 'Sem chave PIX'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Líquido
                            </span>
                            <span className="text-base font-black text-emerald-700 tabular-nums">
                              R$ {item.liquidoPagar.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Diárias</span>
                            <strong className="text-slate-800 tabular-nums">{item.totalDiariasQtd}x</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Bruto</span>
                            <strong className="text-slate-800 tabular-nums">
                              R$ {item.totalDiariasValor.toFixed(2)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Vales</span>
                            <strong className="text-rose-600 tabular-nums">
                              {item.totalValesValor > 0 ? `- R$ ${item.totalValesValor.toFixed(2)}` : '—'}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setModalExtrato(item)}
                            className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold text-center"
                          >
                            Ver Extrato Dia a Dia
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEnviarExtratoTrabalhador(item)}
                            className="py-2 px-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 shrink-0"
                            title="Enviar extrato individual via WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Visão Desktop / Tablet: Tabela Completa */}
                  <div className="hidden md:block overflow-x-auto max-h-[520px] overflow-y-auto">
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
                </>
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
              type="button"
              onClick={handleExportarAnaliticoXls}
              disabled={exportandoExcelV6}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
              title="Baixar Extrato Analítico completo em 5 abas (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportandoExcelV6 ? '...' : '5 Abas'}</span>
            </button>
          </div>

          <div className="bg-gradient-to-br from-slate-950 to-slate-900 text-white p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Total de Linhas Auditadas</span>
              <span className="text-emerald-400 font-bold text-xs">{lancamentosDetalhados.length} lançamentos • 5 abas</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Gera a planilha completa com 5 abas e fórmulas nativas <code className="text-emerald-300">=SUM(...)</code>: Resumo por Trabalhador, Detalhamento de Diárias (rateios ½+½ e chuva R$ 120), Controle de Vales (rastreabilidade 4 campos), Caixinha de Campo (pré-implantação 13/11) e Custo por Obra (Mão de Obra + Caixinha).
            </p>
            <button
              type="button"
              onClick={handleExportarAnaliticoXls}
              disabled={exportandoExcelV6}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                {exportandoExcelV6
                  ? 'Gerando Planilha 5 Abas...'
                  : 'Baixar Extrato Analítico (5 Abas .xlsx)'}
              </span>
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
                          {extrairNomeObraRel(l.obras_config)}
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
      )}
    </div>
  );
}

