'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Banknote,
  Camera,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
  Sparkles,
  FileImage,
  AlertCircle,
} from 'lucide-react';
import ValidacaoTabsHeader from '@/components/ValidacaoTabsHeader';
import { ReceiptLightbox } from '@/components/ReceiptLightbox';
import type { ValeEtapa } from '@/types/database';

interface ValeItem {
  id: string;
  trabalhador: string;
  obraId: string | null;
  obra: string;
  data: string;
  horario: string;
  valor: number;
  status: string;
  etapa: ValeEtapa;
  solicitadoPor: string;
  dataHoraSolicitacao?: string;
  aprovadoPor?: string | null;
  pagoPor: string | null;
  dataHoraEnvioEfetivo?: string | null;
  comprovantePixUrl: string | null;
  observacao: string;
}

interface ValesKpis {
  aguardandoEnvioPixQtd: number;
  aguardandoEnvioPixValor: number;
  confirmadosQtd: number;
  confirmadosValor: number;
  totalQtd: number;
  totalValor: number;
}

interface ObraOption {
  id: string;
  nome: string;
}

interface OcrPreviewState {
  tipoDocumento: string;
  nomeTrabalhador: string | null;
  valor: number;
  data: string | null;
  pagador: string | null;
  obraSugerida: string | null;
  comprovanteUrl: string | null;
  solicitacaoSugeridaId: string | null;
  imagemBase64: string;
  imagemMimeType: string;
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ValidacaoValesPage() {
  const [vales, setVales] = useState<ValeItem[]>([]);
  const [kpis, setKpis] = useState<ValesKpis>({
    aguardandoEnvioPixQtd: 0,
    aguardandoEnvioPixValor: 0,
    confirmadosQtd: 0,
    confirmadosValor: 0,
    totalQtd: 0,
    totalValor: 0,
  });
  const [trabalhadores, setTrabalhadores] = useState<string[]>([]);
  const [obras, setObras] = useState<ObraOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'TODOS' | 'SOLICITADO' | 'CONCILIADO'>('TODOS');

  // Formulário com dropdowns Trabalhador e Obra (valor padrão R$ 100,00 se omitido)
  const [trabalhadorSel, setTrabalhadorSel] = useState<string>('');
  const [obraIdSel, setObraIdSel] = useState<string>('');
  const [valorInput, setValorInput] = useState<string>('100');
  const [dataInput, setDataInput] = useState<string>(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  );
  const [solicitanteInput, setSolicitanteInput] = useState<string>('Gil');
  const [obsInput, setObsInput] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);

  // OCR Gemini Vision
  const [lendoOcr, setLendoOcr] = useState<boolean>(false);
  const [ocrPreview, setOcrPreview] = useState<OcrPreviewState | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch('/api/vales', { cache: 'no-store' });
      if (!res.ok) throw new Error('Falha ao carregar fila de vales.');
      const d = (await res.json()) as {
        kpis?: ValesKpis;
        vales?: ValeItem[];
        trabalhadores?: string[];
        obras?: ObraOption[];
      };
      setVales(d.vales || []);
      if (d.kpis) setKpis(d.kpis);
      const listaTrabs = d.trabalhadores || [];
      const listaObras = d.obras || [];
      setTrabalhadores(listaTrabs);
      setObras(listaObras);
      if (!trabalhadorSel && listaTrabs.length > 0) {
        setTrabalhadorSel(listaTrabs[0]);
      }
      if (!obraIdSel && listaObras.length > 0) {
        setObraIdSel(listaObras[0].id);
      }
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar vales.');
    } finally {
      setLoading(false);
    }
  }, [trabalhadorSel, obraIdSel]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleCriarSolicitacao(e: React.FormEvent) {
    e.preventDefault();
    if (!trabalhadorSel) return;
    setSalvando(true);
    setErro(null);
    try {
      const valorNum = parseFloat(valorInput.replace(',', '.')) || 100.0;
      const res = await fetch('/api/vales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'criar-solicitacao',
          trabalhador: trabalhadorSel,
          obraId: obraIdSel || null,
          valor: valorNum,
          data: dataInput,
          solicitadoPor: solicitanteInput,
          observacao: obsInput,
        }),
      });
      const d = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok || d.error) {
        setErro(d.error || 'Não foi possível registrar a solicitação.');
      } else {
        setAviso(d.message || 'Solicitação registrada!');
        setObsInput('');
        setValorInput('100');
        setTimeout(() => setAviso(null), 5000);
        await carregar();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleUploadOcr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLendoOcr(true);
    setErro(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/vales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ocr-comprovante',
          imagemBase64: base64,
          imagemMimeType: file.type || 'image/jpeg',
        }),
      });
      const d = (await res.json()) as {
        success?: boolean;
        leitura?: {
          tipoDocumento: string;
          nomeTrabalhador: string | null;
          valor: number;
          data: string | null;
          pagador: string | null;
          obraSugerida: string | null;
        };
        comprovanteUrl?: string | null;
        solicitacaoSugeridaId?: string | null;
        error?: string;
      };
      if (!res.ok || d.error || !d.leitura) {
        setErro(d.error || 'Falha na leitura OCR Gemini Vision.');
        return;
      }

      if (d.leitura.nomeTrabalhador) {
        setTrabalhadorSel(d.leitura.nomeTrabalhador);
      }
      if (d.leitura.valor > 0) {
        setValorInput(String(d.leitura.valor));
      }
      if (d.leitura.data) {
        setDataInput(d.leitura.data);
      }

      setOcrPreview({
        ...d.leitura,
        comprovanteUrl: d.comprovanteUrl || null,
        solicitacaoSugeridaId: d.solicitacaoSugeridaId || null,
        imagemBase64: base64,
        imagemMimeType: file.type || 'image/jpeg',
      });
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao ler imagem.');
    } finally {
      setLendoOcr(false);
      e.target.value = '';
    }
  }

  async function handleConfirmarOcrComprovante() {
    if (!ocrPreview) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/vales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirmar-pix',
          valeId: ocrPreview.solicitacaoSugeridaId || undefined,
          trabalhador: trabalhadorSel || ocrPreview.nomeTrabalhador || '',
          obraId: obraIdSel || null,
          obraNome: ocrPreview.obraSugerida || undefined,
          valor: parseFloat(valorInput.replace(',', '.')) || ocrPreview.valor || 100.0,
          data: dataInput,
          pagoPor: ocrPreview.pagador || 'Patrícia Grubel',
          imagemBase64: ocrPreview.imagemBase64,
          imagemMimeType: ocrPreview.imagemMimeType,
          observacao: `Comprovante PIX validado via OCR Gemini Vision`,
        }),
      });
      const d = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok || d.error) {
        setErro(d.error || 'Erro ao confirmar comprovante PIX.');
      } else {
        setAviso(d.message || 'Comprovante PIX confirmado!');
        setOcrPreview(null);
        setTimeout(() => setAviso(null), 5000);
        await carregar();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleConfirmarPixDireto(vale: ValeItem, file?: File) {
    setConfirmandoId(vale.id);
    setErro(null);
    try {
      let imagemBase64: string | undefined;
      let imagemMimeType: string | undefined;
      if (file) {
        imagemBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Falha ao ler comprovante.'));
          reader.readAsDataURL(file);
        });
        imagemMimeType = file.type || 'image/jpeg';
      }

      const res = await fetch('/api/vales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirmar-pix',
          valeId: vale.id,
          pagoPor: 'Patrícia Grubel',
          imagemBase64,
          imagemMimeType,
        }),
      });
      const d = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || d.error) {
        setErro(d.error || 'Erro ao confirmar PIX.');
      } else {
        setAviso(d.message || 'Etapa 2 (PIX) confirmada!');
        setTimeout(() => setAviso(null), 4000);
        await carregar();
      }
    } finally {
      setConfirmandoId(null);
    }
  }

  async function handleDescartar(valeId: string) {
    if (!window.confirm('Descartar este vale (Soft Delete auditado)?')) return;
    await fetch('/api/vales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'descartar-vale', valeId }),
    });
    await carregar();
  }

  const valesFiltrados = vales.filter((v) => {
    if (filtro === 'SOLICITADO') return v.etapa === 'SOLICITADO';
    if (filtro === 'CONCILIADO')
      return v.etapa === 'CONCILIADO' || v.etapa === 'PIX_ENVIADO';
    return true;
  });

  return (
    <div>
      <ValidacaoTabsHeader activeTab="vales" />

      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-[11px] sm:text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full w-fit mb-2 border border-emerald-200">
              <Banknote className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Fluxo 2 Etapas • Pedido → PIX</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
              Validação &amp; Controle de Vales
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Rastreabilidade completa do pedido de campo até a confirmação do comprovante PIX. Valor padrão R$ 100,00 quando omitido.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-2 shadow-sm cursor-pointer transition-all">
              <Camera className="w-4 h-4 shrink-0" />
              <span>{lendoOcr ? 'Lendo OCR...' : 'Ler Pedido / PIX com IA'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadOcr}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => void carregar()}
              disabled={loading}
              className="p-2.5 sm:px-3.5 sm:py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shrink-0"
              title="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>

        {/* Feedback */}
        {erro && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}
        {aviso && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{aviso}</span>
          </div>
        )}

        {/* KPIs (tabular-nums) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-200 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-amber-800">
              <span>Etapa 1 • Aguardando PIX</span>
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-900 tabular-nums mt-1.5 sm:mt-2">
              {kpis.aguardandoEnvioPixQtd} pedido(s) •{' '}
              {formatBRL(kpis.aguardandoEnvioPixValor)}
            </p>
            <p className="text-[11px] text-amber-700/80 mt-0.5">
              Solicitações pendentes de comprovante PIX
            </p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-emerald-200 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
              <span>Etapa 2 • Vales Confirmados</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 tabular-nums mt-1.5 sm:mt-2">
              {kpis.confirmadosQtd} vale(s) • {formatBRL(kpis.confirmadosValor)}
            </p>
            <p className="text-[11px] text-emerald-700/80 mt-0.5">
              Conciliados e ativos para abatimento no Borderô
            </p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Total Consolidado de Vales</span>
              <Banknote className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-950 tabular-nums mt-1.5 sm:mt-2">
              {kpis.totalQtd} registro(s) • {formatBRL(kpis.totalValor)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Excluindo registros descartados (Soft Delete)
            </p>
          </div>
        </div>

        {/* Preview OCR Gemini Vision */}
        {ocrPreview && (
          <div className="p-5 rounded-3xl bg-indigo-50 border border-indigo-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-indigo-950">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>
                  Leitura OCR Gemini Vision ({ocrPreview.tipoDocumento})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOcrPreview(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs bg-white p-3.5 rounded-2xl border border-indigo-100">
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">
                  Trabalhador Detectado
                </span>
                <strong className="text-slate-900">
                  {ocrPreview.nomeTrabalhador || 'Selecione abaixo'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">
                  Valor Lido
                </span>
                <strong className="text-emerald-700 tabular-nums">
                  {formatBRL(ocrPreview.valor)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">
                  Pagador / Data
                </span>
                <strong className="text-slate-900">
                  {ocrPreview.pagador || 'Administração'} • {ocrPreview.data}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">
                  Pareamento Automático
                </span>
                <strong className="text-indigo-700">
                  {ocrPreview.solicitacaoSugeridaId
                    ? 'Pedido pendente encontrado!'
                    : 'Novo vale já conciliado'}
                </strong>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={salvando}
                onClick={() => void handleConfirmarOcrComprovante()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {ocrPreview.solicitacaoSugeridaId
                    ? 'Parear Comprovante PIX & Validar Vale'
                    : 'Confirmar & Salvar Vale com Comprovante PIX'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Formulário Etapa 1 com Dropdowns de Trabalhador e Obra */}
        <form
          onSubmit={handleCriarSolicitacao}
          className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Nova Solicitação de Vale (Etapa 1 — Dropdowns Oficiais)
            </h2>
            <span className="text-[11px] font-semibold text-slate-400">
              Padrão R$ 100,00 se valor omitido
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <select
              value={trabalhadorSel}
              onChange={(e) => setTrabalhadorSel(e.target.value)}
              className="sm:col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900"
              required
            >
              <option value="">Trabalhador...</option>
              {trabalhadores.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={obraIdSel}
              onChange={(e) => setObraIdSel(e.target.value)}
              className="sm:col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900"
            >
              <option value="">Obra...</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dataInput}
              onChange={(e) => setDataInput(e.target.value)}
              className="sm:col-span-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900"
            />

            <input
              type="text"
              value={valorInput}
              onChange={(e) => setValorInput(e.target.value)}
              placeholder="Valor (100)"
              className="sm:col-span-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-900 tabular-nums"
            />

            <input
              type="text"
              value={solicitanteInput}
              onChange={(e) => setSolicitanteInput(e.target.value)}
              placeholder="Solicitado por..."
              className="sm:col-span-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800"
            />

            <button
              type="submit"
              disabled={salvando}
              className="sm:col-span-1 py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center"
              title="Registrar solicitação de vale (Etapa 1)"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Filtros e Lista de Vales com Rastreabilidade */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Trilha de Rastreabilidade (Pedido → Comprovante PIX)
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'TODOS', label: `Todos (${vales.length})` },
                  {
                    id: 'SOLICITADO',
                    label: `Aguardando PIX (${kpis.aguardandoEnvioPixQtd})`,
                  },
                  {
                    id: 'CONCILIADO',
                    label: `Confirmados (${kpis.confirmadosQtd})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFiltro(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                    filtro === tab.id
                      ? 'bg-slate-950 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-4 sm:p-6 space-y-3 animate-pulse">
              <div className="h-14 rounded-2xl bg-slate-100" />
              <div className="h-14 rounded-2xl bg-slate-100" />
            </div>
          ) : valesFiltrados.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhum vale encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {valesFiltrados.map((v) => {
                const isPendente = v.etapa === 'SOLICITADO';
                return (
                  <div
                    key={v.id}
                    className="px-4 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="text-sm font-black text-slate-950">
                          {v.trabalhador}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                          {v.obra}
                        </span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            isPendente
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {isPendente
                            ? 'Etapa 1: Aguardando PIX'
                            : 'Etapa 2: PIX Confirmado'}
                        </span>
                        {v.status === 'LIQUIDADO' && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-900 text-white">
                            Liquidado no Borderô
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500">
                        <span className="tabular-nums">
                          Solicitado: {v.data} às {v.horario}
                        </span>
                        <span>•</span>
                        <span>
                          Pedido por:{' '}
                          <strong className="text-slate-700">{v.solicitadoPor}</strong>
                        </span>
                        {(v.aprovadoPor || v.pagoPor) && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <UserCheck className="w-3 h-3 shrink-0" />
                              Aprovado/PIX: {v.aprovadoPor || v.pagoPor}
                              {v.dataHoraEnvioEfetivo && (
                                <span className="text-emerald-600/80 font-normal tabular-nums">
                                  (
                                  {new Date(v.dataHoraEnvioEfetivo).toLocaleString(
                                    'pt-BR',
                                    {
                                      timeZone: 'America/Sao_Paulo',
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}
                                  )
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">{v.observacao}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      <span className="text-base font-black text-slate-950 tabular-nums">
                        {formatBRL(v.valor)}
                      </span>

                      <div className="flex flex-wrap items-center gap-2">
                        {v.comprovantePixUrl && (
                          <ReceiptLightbox
                            comprovanteUrl={v.comprovantePixUrl}
                            nomeFuncionario={v.trabalhador}
                            dataReferencia={v.data}
                          />
                        )}

                        {isPendente && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <label className="px-3 py-2 sm:py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1.5 cursor-pointer shadow-sm">
                              <FileImage className="w-3.5 h-3.5" />
                              <span>
                                {confirmandoId === v.id
                                  ? 'Enviando...'
                                  : 'Anexar PIX'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(ev) => {
                                  const f = ev.target.files?.[0];
                                  if (f) void handleConfirmarPixDireto(v, f);
                                  ev.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={confirmandoId === v.id}
                              onClick={() => void handleConfirmarPixDireto(v)}
                              className="px-3 py-2 sm:py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold"
                            >
                              Confirmar sem foto
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleDescartar(v.id)}
                          className="p-2 sm:p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Descartar vale (Soft Delete)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
