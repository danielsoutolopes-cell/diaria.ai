'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
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
  Camera,
  Sparkles,
  FileText,
  Printer,
  Send,
  ExternalLink,
  Building2,
  CheckSquare,
  Square,
  Info,
} from 'lucide-react';
import { gerarPayloadPix } from '@/lib/pix';
import type { LinhaBorderoExport } from '@/lib/exportExcel';

const ReceiptLightbox = dynamic(
  () =>
    import('@/components/ReceiptLightbox').then((m) => ({
      default: m.ReceiptLightbox,
    })),
  { ssr: false }
);
import { calcularBrutoPorRegime } from '@/services/regimesRemuneracao';
import {
  alterarSelecaoFuncionario,
  desmarcarTodosGlobal,
  extrairObrasComDiariasEmAberto,
  listarAvisosValesAbertosParaObra,
  marcarTodosGlobal,
  resolverObraLancamento,
  selecionarPagarPorObra,
} from '@/lib/borderoSelecao';

interface ReciboLiquidacaoModalState {
  nomeTrabalhador: string;
  chavePix: string;
  telefoneTrabalhador: string;
  reciboUrl: string | null;
  r2Salvo: boolean;
  fileName: string;
  pdfBase64: string;
  sha256: string;
  totalBruto: number;
  totalVales: number;
  totalLiquido: number;
  resumoTextoWhatsApp: string;
  enviandoZap: boolean;
  zapStatus: { tipo: 'sucesso' | 'erro'; texto: string } | null;
}

interface LinhaLancamento {
  id: string;
  data: string;
  descricao: string;
  obra?: string;
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
  regimeRemuneracao?:
    | 'DIARISTA'
    | 'SEMANALISTA'
    | 'QUINZENALISTA'
    | 'MENSALISTA'
    | 'DIAS_UTEIS_SEG_SAB';
  cicloPagamento?: 'SEMANAL' | 'QUINZENAL';
  valorBaseContratual?: number;
  regraDiasUteisSegSab?: boolean;
  lancamentos: LinhaLancamento[];
}

interface LiquidacaoOcrPreview {
  comprovantePixUrl: string | null;
  trabalhadorMatch: string | null;
  leitura: {
    nomeTrabalhador: string | null;
    valor: number;
    data: string | null;
    pagador: string | null;
  };
  lancamentosCandidatos: Array<{
    id: string;
    data: string;
    obra: string;
    tipo: string;
    fracao: number;
    valor: number;
    observacao: string;
  }>;
  resumoPreview: {
    valorComprovantePix: number;
    totalLiquidoAberto: number;
    diferenca: number;
    quantidadeLancamentos: number;
    zeraSaldoExato: boolean;
  };
}

export default function BorderoPage() {
  const [funcionarios, setFuncionarios] = useState<ExtratoFuncionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [cicloAtivo, setCicloAtivo] = useState<'SEMANAL' | 'QUINZENAL' | 'TODOS'>('TODOS');
  const [obraSelecionada, setObraSelecionada] = useState<string>('');
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [modalPix, setModalPix] = useState<{ nome: string; valor: number; payload: string; chave: string } | null>(null);
  const [liquidando, setLiquidando] = useState(false);
  const [liquidadoSucesso, setLiquidadoSucesso] = useState(false);
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [lendoComprovantePix, setLendoComprovantePix] = useState<boolean>(false);
  const [ocrLiquidacao, setOcrLiquidacao] = useState<LiquidacaoOcrPreview | null>(null);
  const [erroOcr, setErroOcr] = useState<string | null>(null);
  const [gerandoReciboId, setGerandoReciboId] = useState<string | null>(null);
  const [reciboModal, setReciboModal] = useState<ReciboLiquidacaoModalState | null>(null);
  const [ffExtratoLink, setFfExtratoLink] = useState<boolean>(false);
  const [linkExtratoCopiado, setLinkExtratoCopiado] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/feature-flags', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { flags?: { FF_EXTRATO_COLABORADOR_LINK?: boolean } }) => {
        setFfExtratoLink(d?.flags?.FF_EXTRATO_COLABORADOR_LINK === true);
      })
      .catch(() => setFfExtratoLink(false));
  }, []);

  async function handleGerarLinkExtratoColaborador(nomeTrabalhador: string) {
    try {
      const res = await fetch('/api/extrato-colaborador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trabalhador: nomeTrabalhador, periodoDias: 15 }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        urlCompleta?: string;
        urlRelativa?: string;
      };
      const url = data.urlCompleta || data.urlRelativa;
      if (res.ok && url) {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(url);
        }
        setLinkExtratoCopiado(nomeTrabalhador);
        setTimeout(() => setLinkExtratoCopiado(null), 3500);
      }
    } catch {
      // Silencioso caso usuário não autorize clipboard
    }
  }

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
      setObraSelecionada('');
    } catch (e) {
      console.error(e);
      setFuncionarios([]);
      setObraSelecionada('');
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

  function handleDesmarcarTodosGlobal() {
    setObraSelecionada('');
    setFuncionarios((prev) => desmarcarTodosGlobal(prev));
  }

  function handleMarcarTodosGlobal() {
    setObraSelecionada('');
    setFuncionarios((prev) => marcarTodosGlobal(prev));
  }

  function handleMarcarTodosFuncionario(funcId: string) {
    setFuncionarios((prev) => alterarSelecaoFuncionario(prev, funcId, true));
  }

  function handleDesmarcarTodosFuncionario(funcId: string) {
    setFuncionarios((prev) => alterarSelecaoFuncionario(prev, funcId, false));
  }

  function handleSelecionarObraPagamento(obra: string) {
    setObraSelecionada(obra);
    if (!obra) {
      return;
    }
    setFuncionarios((prev) => selecionarPagarPorObra(prev, obra));
  }

  function updatePix(funcId: string, novaChave: string) {
    setFuncionarios((prev) =>
      prev.map((f) => (f.id === funcId ? { ...f, chavePix: novaChave } : f))
    );
  }

  function formatarResumoRateioPix(f: ExtratoFuncionario): string {
    const pontosMarcados = f.lancamentos.filter(
      (l) => l.tipo === 'PONTO' && l.selecionado
    );
    const porObra = new Map<string, number>();
    pontosMarcados.forEach((p) => {
      const ob = resolverObraLancamento(p.obra, f.obra);
      porObra.set(ob, Number(((porObra.get(ob) || 0) + p.fracao).toFixed(2)));
    });
    if (porObra.size > 1) {
      return Array.from(porObra.entries())
        .map(([ob, fr]) => `${String(fr).replace('.', ',')}d ${ob}`)
        .join(' + ');
    }
    const obraUnica = Array.from(porObra.keys())[0] || f.obra;
    const soma = pontosMarcados.reduce((acc, p) => acc + p.fracao, 0);
    return `${String(Number(soma.toFixed(2))).replace('.', ',')}d ${obraUnica}`;
  }

  function calcularTotais(f: ExtratoFuncionario) {
    const pontosMarcados = f.lancamentos.filter((l) => l.tipo === 'PONTO' && l.selecionado);
    const valesMarcados = f.lancamentos.filter((l) => l.tipo === 'VALE' && l.selecionado);

    const somaPontosBrutos = pontosMarcados.reduce((acc, curr) => acc + curr.valor, 0);
    const somaFracoesPontos = pontosMarcados.reduce((acc, curr) => acc + curr.fracao, 0);
    const totalVales = valesMarcados.reduce((acc, curr) => acc + curr.valor, 0);

    // Se nenhuma diária/ponto está selecionada, o bruto selecionado é R$ 0,00
    // (garante que "Desmarcar Todos" ou "Pagar por Obra" sem diárias na obra zere exatamente em R$ 0,00)
    if (pontosMarcados.length === 0) {
      return {
        totalBruto: 0,
        totalVales,
        totalLiquido: 0,
        totalDiarias: 0,
        detalheRegime: 'Nenhum ponto selecionado',
      };
    }

    const regimeCalc = calcularBrutoPorRegime({
      nomeTrabalhador: f.nome,
      regimeRemuneracao: f.regimeRemuneracao,
      valorBaseContratual: f.valorBaseContratual,
      diariaPadrao: f.diariaPadrao,
      regraDiasUteisSegSab: f.regraDiasUteisSegSab,
      somaPontosBrutos,
      somaFracoesPontos,
    });

    const totalBruto = regimeCalc.totalBruto;
    const totalLiquido = Math.max(0, totalBruto - totalVales);
    const totalDiarias = regimeCalc.totalDiasConsiderados;

    return {
      totalBruto,
      totalVales,
      totalLiquido,
      totalDiarias,
      detalheRegime: regimeCalc.detalheCalculo,
    };
  }

  async function handleLerComprovantePixLiquidacao(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLendoComprovantePix(true);
    setErroOcr(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler comprovante.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/liquidar/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagemBase64: base64,
          imagemMimeType: file.type || 'image/jpeg',
        }),
      });
      const d = (await res.json()) as LiquidacaoOcrPreview & { error?: string };
      if (!res.ok || d.error) {
        setErroOcr(d.error || 'Falha na leitura OCR do comprovante PIX.');
      } else {
        setOcrLiquidacao(d);
      }
    } catch (err: unknown) {
      setErroOcr(err instanceof Error ? err.message : 'Erro ao ler imagem PIX.');
    } finally {
      setLendoComprovantePix(false);
      e.target.value = '';
    }
  }

  async function handleConfirmarLiquidacaoOcr() {
    if (!ocrLiquidacao || ocrLiquidacao.lancamentosCandidatos.length === 0) return;
    setLiquidando(true);
    try {
      const ids = ocrLiquidacao.lancamentosCandidatos.map((c) => c.id);
      const res = await fetch('/api/liquidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lancamentosIds: ids,
          observacao: `Quitação PIX via Comprovante OCR (${ocrLiquidacao.trabalhadorMatch || 'Colaborador'} — R$ ${ocrLiquidacao.resumoPreview.valorComprovantePix.toFixed(2)})`,
          quitadoPor: usuarioAtual,
          comprovantePixUrl: ocrLiquidacao.comprovantePixUrl,
        }),
      });
      if (res.ok) {
        setOcrLiquidacao(null);
        setLiquidadoSucesso(true);
        await carregarBordero();
        setTimeout(() => setLiquidadoSucesso(false), 3000);
      }
    } finally {
      setLiquidando(false);
    }
  }

  function handleCopiarPix(f: ExtratoFuncionario) {
    const totais = calcularTotais(f);
    const resumoObras = formatarResumoRateioPix(f);
    const descritivo = `Pgto: ${resumoObras} - Vales R$${totais.totalVales.toFixed(0)}`;

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
    const resumoObras = formatarResumoRateioPix(f);
    const descritivo = `Pgto: ${resumoObras} - Vales R$${totais.totalVales.toFixed(0)}`;
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

  function baixarPdfBase64Local(
    pdfBase64: string,
    fileName: string,
    abrirNovaAba = false
  ) {
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (abrirNovaAba) {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function handleGerarReciboIndividual(f: ExtratoFuncionario) {
    const selecionados = f.lancamentos.filter((l) => l.selecionado);
    if (selecionados.length === 0) return;

    setGerandoReciboId(f.id);
    try {
      const res = await fetch('/api/recibo-liquidacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gerar',
          nomeTrabalhador: f.nome,
          chavePix: f.chavePix,
          quitadoPor: usuarioAtual,
          lancamentosIds: selecionados.map((l) => l.id),
          itens: selecionados.map((l) => ({
            data: l.data,
            obra: l.obra || f.obra,
            tipo: l.tipo,
            fracao: l.fracao,
            valor: l.valor,
            descricao: l.descricao,
          })),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        nomeTrabalhador?: string;
        chavePix?: string;
        telefoneTrabalhador?: string | null;
        reciboUrl?: string | null;
        r2Salvo?: boolean;
        fileName?: string;
        pdfBase64?: string;
        sha256?: string;
        totalBruto?: number;
        totalVales?: number;
        totalLiquido?: number;
        resumoTextoWhatsApp?: string;
        error?: string;
      };

      if (!res.ok || !data.success || !data.pdfBase64) {
        setErroOcr(data.error || 'Falha ao gerar recibo PIX individual.');
        return;
      }

      setReciboModal({
        nomeTrabalhador: data.nomeTrabalhador || f.nome,
        chavePix: data.chavePix || f.chavePix,
        telefoneTrabalhador: data.telefoneTrabalhador || '',
        reciboUrl: data.reciboUrl || null,
        r2Salvo: Boolean(data.r2Salvo),
        fileName: data.fileName || `recibo-${f.nome}.pdf`,
        pdfBase64: data.pdfBase64,
        sha256: data.sha256 || '',
        totalBruto: data.totalBruto ?? 0,
        totalVales: data.totalVales ?? 0,
        totalLiquido: data.totalLiquido ?? 0,
        resumoTextoWhatsApp: data.resumoTextoWhatsApp || '',
        enviandoZap: false,
        zapStatus: null,
      });
    } catch (err: unknown) {
      setErroOcr(
        err instanceof Error ? err.message : 'Erro ao gerar recibo PIX.'
      );
    } finally {
      setGerandoReciboId(null);
    }
  }

  async function handleEnviarReciboWhatsappOpcional() {
    if (!reciboModal) return;
    setReciboModal((prev) =>
      prev ? { ...prev, enviandoZap: true, zapStatus: null } : null
    );
    try {
      const res = await fetch('/api/recibo-liquidacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enviar-whatsapp',
          telefone: reciboModal.telefoneTrabalhador,
          pdfBase64: reciboModal.pdfBase64,
          fileName: reciboModal.fileName,
          resumoTextoWhatsApp: reciboModal.resumoTextoWhatsApp,
          reciboUrl: reciboModal.reciboUrl || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (res.ok && data.success) {
        setReciboModal((prev) =>
          prev
            ? {
                ...prev,
                enviandoZap: false,
                zapStatus: {
                  tipo: 'sucesso',
                  texto:
                    data.message || 'Recibo enviado no WhatsApp do colaborador.',
                },
              }
            : null
        );
      } else {
        setReciboModal((prev) =>
          prev
            ? {
                ...prev,
                enviandoZap: false,
                zapStatus: {
                  tipo: 'erro',
                  texto:
                    data.error ||
                    'Não foi possível enviar via Baileys. Use o botão Baixar/Imprimir ou WhatsApp Web.',
                },
              }
            : null
        );
      }
    } catch (err: unknown) {
      setReciboModal((prev) =>
        prev
          ? {
              ...prev,
              enviandoZap: false,
              zapStatus: {
                tipo: 'erro',
                texto:
                  err instanceof Error
                    ? err.message
                    : 'Falha ao enviar no WhatsApp.',
              },
            }
          : null
      );
    }
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
        body: JSON.stringify({
          lancamentosIds: idsParaLiquidar,
          quitadoPor: usuarioAtual,
        }),
      });

      setLiquidadoSucesso(true);
      setTimeout(() => {
        setFuncionarios((prev) =>
          prev
            .map((f) => ({
              ...f,
              lancamentos: f.lancamentos.filter((l) => !l.selecionado),
            }))
            .filter((f) => f.lancamentos.length > 0)
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

  const obrasDisponiveis = extrairObrasComDiariasEmAberto(funcionarios);
  const avisosValesPorObra = obraSelecionada
    ? listarAvisosValesAbertosParaObra(funcionarios, obraSelecionada)
    : [];
  const avisosValesPorFuncId = new Map(
    avisosValesPorObra.map((aviso) => [aviso.funcionarioId, aviso])
  );
  const totalItensAbertos = funcionarios.reduce(
    (acc, f) => acc + f.lancamentos.length,
    0
  );
  const totalItensSelecionados = funcionarios.reduce(
    (acc, f) => acc + f.lancamentos.filter((l) => l.selecionado).length,
    0
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-8 pb-52 lg:pb-36">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-[11px] sm:text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full w-fit mb-2 border border-amber-200/80 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Fechamento Multi-Ciclo • PIX &amp; Quitação OCR</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
            Borderô e Pagamento da Folha
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Gestão integrada de mão de obra de campo com isolamento de ciclos pós-quitação e rateio multi-obra explícito no PIX.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
          {/* Seletor de Ciclo de Fechamento */}
          <div className="grid grid-cols-3 sm:flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 w-full sm:w-auto gap-1">
            <button
              onClick={() => setCicloAtivo('TODOS')}
              className={`px-2 sm:px-3 py-2 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all text-center ${
                cicloAtivo === 'TODOS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos ({funcionarios.length})
            </button>
            <button
              onClick={() => setCicloAtivo('SEMANAL')}
              className={`px-2 sm:px-3 py-2 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all text-center ${
                cicloAtivo === 'SEMANAL' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="sm:hidden">
                Semanal ({funcionarios.filter((f) => f.cicloPagamento === 'SEMANAL' || f.regimeRemuneracao === 'SEMANALISTA' || f.regimeRemuneracao === 'MENSALISTA').length})
              </span>
              <span className="hidden sm:inline">
                Toda Sexta / Semanal ({funcionarios.filter((f) => f.cicloPagamento === 'SEMANAL' || f.regimeRemuneracao === 'SEMANALISTA' || f.regimeRemuneracao === 'MENSALISTA').length})
              </span>
            </button>
            <button
              onClick={() => setCicloAtivo('QUINZENAL')}
              className={`px-2 sm:px-3 py-2 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all text-center ${
                cicloAtivo === 'QUINZENAL' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Quinzenal ({funcionarios.filter((f) => f.cicloPagamento !== 'SEMANAL' && f.regimeRemuneracao !== 'SEMANALISTA' && f.regimeRemuneracao !== 'MENSALISTA').length})
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="flex-1 sm:flex-none justify-center px-3.5 sm:px-4 py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black transition-all shadow-sm flex items-center gap-2 cursor-pointer active:scale-95">
              <Camera className="w-4 h-4 shrink-0" />
              <span>
                {lendoComprovantePix
                  ? 'Lendo PIX...'
                  : 'Liquidar PIX (Foto)'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleLerComprovantePixLiquidacao}
                className="hidden"
              />
            </label>

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
                void import('@/lib/exportExcel').then(({ exportarParaExcel }) =>
                  exportarParaExcel(
                    linhasExport,
                    `fechamento-bordero-${new Date().toISOString().split('T')[0]}`
                  )
                );
              }}
              disabled={funcionarios.length === 0}
              className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 shrink-0"
              title="Exportar borderô para planilha Excel"
            >
              <Download className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>XLS</span>
            </button>

            <button
              onClick={carregarBordero}
              disabled={loading}
              className="p-2.5 sm:p-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl transition-all shadow-sm shrink-0"
              title="Atualizar borderô"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-white p-3 px-4 sm:px-5 rounded-2xl border border-slate-200 shadow-sm flex sm:block items-center justify-between sm:text-right">
            <span className="text-[11px] text-slate-500 font-semibold block">Total em Vales Abatidos</span>
            <span className="text-base font-bold text-rose-600 tabular-nums">- R$ {totalValesGeral.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Erro OCR */}
      {erroOcr && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center justify-between gap-2">
          <span>{erroOcr}</span>
          <button
            type="button"
            onClick={() => setErroOcr(null)}
            className="text-rose-600 hover:text-rose-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Preview Human-in-the-Loop de Liquidação PIX por Imagem (OCR) */}
      {ocrLiquidacao && (
        <div className="p-5 rounded-3xl bg-indigo-50 border border-indigo-200 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-black text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>
                Prévia de Liquidação por Comprovante PIX (Human-in-the-Loop)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOcrLiquidacao(null)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-indigo-100 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Favorecido (Canônico)
              </span>
              <strong className="text-slate-950">
                {ocrLiquidacao.trabalhadorMatch || 'Não identificado'}
              </strong>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Valor do Comprovante PIX
              </span>
              <strong className="text-emerald-700 tabular-nums">
                R$ {ocrLiquidacao.resumoPreview.valorComprovantePix.toFixed(2)}
              </strong>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Saldo em Aberto ({ocrLiquidacao.resumoPreview.quantidadeLancamentos} itens)
              </span>
              <strong className="text-slate-950 tabular-nums">
                R$ {ocrLiquidacao.resumoPreview.totalLiquidoAberto.toFixed(2)}
              </strong>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Status da Quitação
              </span>
              <strong
                className={
                  ocrLiquidacao.resumoPreview.zeraSaldoExato
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }
              >
                {ocrLiquidacao.resumoPreview.zeraSaldoExato
                  ? 'Zera o ciclo com exatidão ✓'
                  : `Diferença: R$ ${ocrLiquidacao.resumoPreview.diferenca.toFixed(2)}`}
              </strong>
            </div>
          </div>

          {ocrLiquidacao.lancamentosCandidatos.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-semibold text-indigo-900">
                Somente os {ocrLiquidacao.lancamentosCandidatos.length} lançamento(s) deste corte serão marcados como <strong>LIQUIDADO</strong>. Apontamentos futuros abrirão novo ciclo automaticamente.
              </span>
              <button
                type="button"
                disabled={liquidando}
                onClick={() => void handleConfirmarLiquidacaoOcr()}
                className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-2 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {liquidando
                    ? 'Liquidando ciclo...'
                    : `Confirmar Quitação de ${ocrLiquidacao.trabalhadorMatch}`}
                </span>
              </button>
            </div>
          ) : (
            <p className="text-xs font-bold text-amber-800">
              Nenhum lançamento em aberto (VALIDADO) encontrado para {ocrLiquidacao.trabalhadorMatch || 'este favorecido'} no ciclo atual.
            </p>
          )}
        </div>
      )}

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
        <div className="space-y-5 sm:space-y-6">
          {/* Barra Global: Desmarcar Todos / Marcar Todos / Pagar por Obra */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 p-3.5 sm:p-4 shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Ações Globais de Seleção */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-xl tabular-nums">
                  {totalItensSelecionados}/{totalItensAbertos} selecionado(s)
                </span>

                <button
                  type="button"
                  onClick={handleDesmarcarTodosGlobal}
                  disabled={totalItensSelecionados === 0}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-45 disabled:cursor-not-allowed"
                  title="Desmarcar todos os lançamentos de todos os colaboradores (zera total para R$ 0,00)"
                >
                  <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>Desmarcar Todos</span>
                </button>

                <button
                  type="button"
                  onClick={handleMarcarTodosGlobal}
                  disabled={totalItensSelecionados === totalItensAbertos && totalItensAbertos > 0}
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-45 disabled:cursor-not-allowed"
                  title="Marcar todos os lançamentos em aberto de todos os colaboradores"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Marcar Todos</span>
                </button>
              </div>

              {/* Seletor Pagar por Obra */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                <label
                  htmlFor="bordero-pagar-por-obra"
                  className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 shrink-0"
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Pagar por Obra:</span>
                </label>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    id="bordero-pagar-por-obra"
                    aria-label="Pagar por Obra"
                    value={obraSelecionada}
                    onChange={(e) => handleSelecionarObraPagamento(e.target.value)}
                    className="flex-1 sm:w-72 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
                  >
                    <option value="">Selecionar obra (somente diárias)...</option>
                    {obrasDisponiveis.map((ob) => (
                      <option key={ob.nome} value={ob.nome}>
                        {ob.nome} — {ob.qtdDiarias} diária(s) • R$ {ob.valorTotalDiarias.toFixed(2)}
                      </option>
                    ))}
                  </select>

                  {obraSelecionada && (
                    <button
                      type="button"
                      onClick={() => setObraSelecionada('')}
                      className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold shrink-0 transition-all"
                      title="Sair do modo Pagar por Obra"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Faixa de status do modo Pagar por Obra + Aviso discreto de vales em aberto */}
            {obraSelecionada && (
              <div className="pt-2.5 border-t border-slate-100 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-bold">
                    <Building2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>
                      Somente diárias de <strong>{obraSelecionada}</strong> selecionadas
                    </span>
                  </span>
                  <span className="text-slate-500">
                    Demais obras e vales foram desmarcados automaticamente.
                  </span>
                </div>

                {avisosValesPorObra.length > 0 && (
                  <div className="px-3 py-2 rounded-xl bg-amber-50/90 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Conferência de vales em aberto:</strong>{' '}
                      {avisosValesPorObra.length} colaborador(es) com diárias nesta obra possuem vales desmarcados (
                      {avisosValesPorObra
                        .map(
                          (a) =>
                            `${a.nome}: R$ ${a.valorTotalValesAbertos.toFixed(2)}`
                        )
                        .join(' • ')}
                      ). Marque manualmente no card do colaborador caso deseje abater neste pagamento.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {funcionarios
            .filter((f) => {
              if (cicloAtivo === 'TODOS') return true;
              if (cicloAtivo === 'SEMANAL') return f.cicloPagamento === 'SEMANAL' || f.regimeRemuneracao === 'SEMANALISTA';
              return f.cicloPagamento !== 'SEMANAL' && f.regimeRemuneracao !== 'SEMANALISTA';
            })
            .map((f) => {
            const totais = calcularTotais(f);
            const qtdSelFunc = f.lancamentos.filter((l) => l.selecionado).length;
            const todosMarcadosFunc =
              f.lancamentos.length > 0 && qtdSelFunc === f.lancamentos.length;
            const avisoValeFunc = avisosValesPorFuncId.get(f.id);

            return (
              <div
                key={f.id}
                className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5 border-b border-slate-800">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        {f.obra}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        f.regimeRemuneracao === 'SEMANALISTA'
                          ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {f.regimeRemuneracao === 'SEMANALISTA' ? 'Semanalista Fixo' : 'Diarista Produção'}
                      </span>
                      <span className="text-[11px] sm:text-xs text-slate-400 tabular-nums">
                        • {f.regimeRemuneracao === 'SEMANALISTA' ? `Fixo: R$ ${(f.valorBaseContratual || 0).toFixed(2)}` : `Diária: R$ ${f.diariaPadrao.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 lg:block">
                      <h3 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">{f.nome}</h3>
                      <div className="lg:hidden text-right shrink-0">
                        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block">
                          Líquido
                        </span>
                        <span className="text-xl font-black text-emerald-400 tabular-nums">
                          R$ {totais.totalLiquido.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
                    <div className="hidden lg:block text-right pr-2 shrink-0">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                        Saldo Líquido
                      </span>
                      <span className="text-2xl font-black text-emerald-400 tabular-nums">
                        R$ {totais.totalLiquido.toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => void handleGerarReciboIndividual(f)}
                        disabled={gerandoReciboId === f.id || qtdSelFunc === 0}
                        className="px-3 sm:px-3.5 py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl sm:rounded-2xl transition-all border border-slate-700 shadow-sm text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                        title="Gerar Comprovante Detalhado Individual de Liquidação PIX (salvo no R2, com impressão/download e envio opcional no WhatsApp)"
                      >
                        <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          {gerandoReciboId === f.id ? 'Gerando...' : 'Recibo PIX'}
                        </span>
                      </button>

                      <button
                        onClick={() => handleAbrirModalPix(f)}
                        className="px-3 sm:p-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl sm:rounded-2xl transition-all border border-slate-700 shadow-sm text-xs font-bold flex items-center justify-center gap-1.5"
                        title="Ver QR Code do PIX"
                      >
                        <QrCode className="w-4 h-4 shrink-0" />
                        <span className="sm:hidden">QR Code</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleCopiarPix(f)}
                      className="w-full sm:w-auto justify-center px-4 sm:px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl sm:rounded-2xl transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 active:scale-95"
                    >
                      {copiadoId === f.id ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 shrink-0" />
                          <span>Copiar PIX Copia e Cola</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sub-header da Janela do Funcionário: Chave PIX + Atalhos Exclusivos Marcar Todos / Desmarcar */}
                <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between gap-2.5 sm:gap-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full md:w-auto">
                    <span className="font-bold text-slate-700 shrink-0">Chave PIX:</span>
                    <input
                      type="text"
                      value={f.chavePix}
                      onChange={(e) => updatePix(f.id, e.target.value)}
                      placeholder="Digite a chave PIX..."
                      className="px-3 py-2 sm:py-1.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500 w-full sm:w-64 shadow-sm"
                    />
                    <span className="hidden lg:inline text-slate-400 text-[11px]">(editável para conferência)</span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                      {qtdSelFunc}/{f.lancamentos.length} marcados
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMarcarTodosFuncionario(f.id)}
                        disabled={todosMarcadosFunc}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-[11px] font-black transition-all flex items-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed active:scale-95"
                        title={`Marcar todos os registros de ${f.nome} sem alterar os demais`}
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Marcar Todos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDesmarcarTodosFuncionario(f.id)}
                        disabled={qtdSelFunc === 0}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold transition-all flex items-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed active:scale-95"
                        title={`Desmarcar todos os registros de ${f.nome} sem alterar os demais`}
                      >
                        <Square className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Desmarcar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Aviso discreto de vales em aberto para conferência quando no modo Pagar por Obra */}
                {avisoValeFunc && obraSelecionada && (
                  <div className="px-4 sm:px-6 py-2 bg-amber-50/75 border-b border-amber-200/70 text-[11px] text-amber-900 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      <strong>Vale em aberto para conferência:</strong> {avisoValeFunc.qtdValesAbertos} vale(s) totalizando{' '}
                      <strong className="tabular-nums">R$ {avisoValeFunc.valorTotalValesAbertos.toFixed(2)}</strong> ficaram desmarcados no modo <em>Pagar por Obra</em> ({obraSelecionada}).
                    </span>
                  </div>
                )}

                {/* Visão Mobile Retrato: Cards Empilhados Toque-Fácil */}
                <div className="md:hidden divide-y divide-slate-100">
                  {f.lancamentos.map((l) => {
                    const obraLinha = resolverObraLancamento(l.obra, f.obra);
                    return (
                    <div
                      key={`mob-${l.id}`}
                      onClick={() => toggleItem(f.id, l.id)}
                      className={`p-4 space-y-2 transition-colors cursor-pointer ${
                        l.selecionado
                          ? 'bg-white active:bg-slate-50'
                          : 'bg-slate-100/60 text-slate-400'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={l.selecionado}
                            onChange={() => {}}
                            className="mt-0.5 w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-700 tabular-nums">
                                {l.data}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  l.tipo === 'PONTO'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/80'
                                }`}
                              >
                                {l.tipo === 'PONTO' ? `DIÁRIA ${l.fracao}x` : 'VALE'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 font-semibold text-[10px] truncate max-w-[140px]">
                                {obraLinha}
                              </span>
                            </div>
                            <p
                              className={`text-xs font-bold mt-1 leading-snug ${
                                l.selecionado
                                  ? 'text-slate-900'
                                  : 'text-slate-400 line-through'
                              }`}
                            >
                              {l.descricao}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-sm font-black tabular-nums shrink-0 ${
                            !l.selecionado
                              ? 'text-slate-400 line-through'
                              : l.tipo === 'PONTO'
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                          }`}
                        >
                          {l.tipo === 'PONTO'
                            ? `+ R$ ${l.valor.toFixed(2)}`
                            : `- R$ ${l.valor.toFixed(2)}`}
                        </span>
                      </div>

                      <div
                        className="flex items-center justify-end gap-2 pl-7 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ReceiptLightbox
                          comprovanteUrl={l.comprovanteUrl}
                          nomeFuncionario={f.nome}
                          dataReferencia={l.data}
                        />
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
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 transition-all"
                          title="Editar este registro confirmado"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Visão Desktop / Tablet: Tabela Completa */}
                <div className="hidden md:block overflow-x-auto">
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
                      {f.lancamentos.map((l) => {
                        const obraLinha = resolverObraLancamento(l.obra, f.obra);
                        return (
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
                            className="p-4 font-semibold text-slate-700 cursor-pointer tabular-nums"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            {l.data}
                          </td>
                          <td
                            className="p-4 font-bold text-slate-900 cursor-pointer"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{l.descricao}</span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 font-semibold text-[10px] no-underline">
                                {obraLinha}
                              </span>
                            </div>
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
                            className="p-4 text-right font-medium text-slate-600 cursor-pointer tabular-nums"
                            onClick={() => toggleItem(f.id, l.id)}
                          >
                            {l.tipo === 'PONTO' ? `${l.fracao}x` : '—'}
                          </td>
                          <td
                            className={`p-4 text-right font-black text-sm cursor-pointer tabular-nums ${l.tipo === 'PONTO' ? 'text-emerald-700' : 'text-rose-600'
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 sm:gap-4 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-600">
                    <span>
                      Diárias: <strong className="text-slate-900 tabular-nums">{totais.totalDiarias}</strong>
                    </span>
                    <span>
                      Vales: <strong className="text-rose-600 tabular-nums">R$ {totais.totalVales.toFixed(2)}</strong>
                    </span>
                    {f.lancamentos.some((l) => l.tipo === 'VALE' && !l.selecionado) && (
                      <span className="text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full font-bold border border-amber-200 tabular-nums">
                        Postergado: R${' '}
                        {f.lancamentos
                          .filter((l) => l.tipo === 'VALE' && !l.selecionado)
                          .reduce((acc, curr) => acc + curr.valor, 0)
                          .toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
                    {ffExtratoLink && (
                      <button
                        type="button"
                        onClick={() => void handleGerarLinkExtratoColaborador(f.nome)}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black flex items-center gap-1.5 transition-all"
                        title="Gerar e copiar link seguro de extrato para o colaborador (sem login)"
                      >
                        <span>
                          {linkExtratoCopiado === f.nome
                            ? 'Link Copiado!'
                            : 'Link Extrato'}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-amber-600 text-white">
                          EM HOMOLOGAÇÃO
                        </span>
                      </button>
                    )}

                    <div className="text-sm font-bold text-slate-900">
                      Subtotal:{' '}
                      <span className="text-emerald-700 font-black text-base ml-1 tabular-nums">
                        R$ {totais.totalLiquido.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Bar: Total Geral + Liquidar (Responsivo Retrato Mobile + Desktop) */}
      {funcionarios.length > 0 && (
        <div className="fixed bottom-[60px] lg:bottom-0 left-0 lg:left-72 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 px-4 sm:px-6 lg:px-8 py-3 lg:py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 z-30">
          <div className="flex sm:block items-baseline justify-between gap-2">
            <span className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider block">
              Total a Transferir
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-3xl font-black text-slate-950 tabular-nums">
                R$ {totalGeral.toFixed(2)}
              </span>
              <span className="hidden md:inline text-xs text-slate-500 font-medium">
                (calculado apenas nas caixas selecionadas)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleLiquidarSemana}
              disabled={liquidando || totalGeral === 0}
              className="w-full sm:w-auto justify-center px-5 lg:px-8 py-3 lg:py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs sm:text-sm font-black rounded-2xl transition-all shadow-lg shadow-emerald-700/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5] shrink-0" />
              <span>{liquidando ? 'Liquidando...' : 'Liquidar e Encerrar Semana'}</span>
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
                        {fr === 1 ? '1.0 Integral' : fr === 0.5 ? '0.5 Meio Dia' : '0.0 Falta'}
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

      {/* Modal Comprovante Detalhado Individual de Liquidação PIX (Prompt 7 — R2 + Impressão + WhatsApp Opcional) */}
      {reciboModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-black text-base text-slate-950">
                    Comprovante Individual de Liquidação PIX
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {reciboModal.nomeTrabalhador} • Chave: {reciboModal.chavePix}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReciboModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo Financeiro + Status R2 */}
            <div className="grid grid-cols-3 gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-center">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Bruto Diárias
                </span>
                <strong className="text-sm font-black text-slate-900 tabular-nums">
                  R$ {reciboModal.totalBruto.toFixed(2)}
                </strong>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Vales Abatidos
                </span>
                <strong className="text-sm font-black text-rose-600 tabular-nums">
                  - R$ {reciboModal.totalVales.toFixed(2)}
                </strong>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Líquido PIX
                </span>
                <strong className="text-sm font-black text-emerald-700 tabular-nums">
                  R$ {reciboModal.totalLiquido.toFixed(2)}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs">
              <div className="flex items-center gap-2 text-emerald-900 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {reciboModal.r2Salvo
                    ? 'Cópia pericial arquivada no Cloudflare R2'
                    : 'PDF gerado localmente (pronto para download/impressão)'}
                </span>
              </div>
              {reciboModal.reciboUrl && (
                <a
                  href={reciboModal.reciboUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir R2</span>
                </a>
              )}
            </div>

            <div className="text-[10px] font-mono text-slate-400 truncate">
              SHA-256: {reciboModal.sha256}
            </div>

            {/* Ações de Download / Impressão (Sempre disponíveis) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  baixarPdfBase64Local(
                    reciboModal.pdfBase64,
                    reciboModal.fileName,
                    false
                  )
                }
                className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Baixar PDF</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  baixarPdfBase64Local(
                    reciboModal.pdfBase64,
                    reciboModal.fileName,
                    true
                  )
                }
                className="py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span>Abrir / Imprimir</span>
              </button>
            </div>

            {/* Envio Opcional no WhatsApp do Trabalhador (Human-in-the-Loop) */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800">
                  Envio Opcional no WhatsApp do Colaborador
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  Opcional (não automático)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={reciboModal.telefoneTrabalhador}
                  onChange={(e) =>
                    setReciboModal({
                      ...reciboModal,
                      telefoneTrabalhador: e.target.value,
                    })
                  }
                  placeholder="DDD + WhatsApp (ex: 11999998888)"
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  type="button"
                  disabled={
                    reciboModal.enviandoZap ||
                    !reciboModal.telefoneTrabalhador.trim()
                  }
                  onClick={() => void handleEnviarReciboWhatsappOpcional()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {reciboModal.enviandoZap ? 'Enviando...' : 'Enviar no Zap'}
                  </span>
                </button>
              </div>
              {reciboModal.zapStatus && (
                <div
                  className={`p-2.5 rounded-xl text-[11px] font-bold ${
                    reciboModal.zapStatus.tipo === 'sucesso'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {reciboModal.zapStatus.texto}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
