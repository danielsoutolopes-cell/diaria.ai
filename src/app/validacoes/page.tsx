'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  CloudRain,
  User,
  Check,
  RefreshCw,
  Car,
  Building2,
  Trash2,
  MessageSquareText,
  Scissors,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ReceiptLightbox } from '@/components/ReceiptLightbox';
import {
  getActiveTenantFromBrowser,
  TENANTS,
  type TenantConfig,
} from '@/lib/tenant';

interface PendenteItem {
  id: string;
  lancamentoId?: string;
  loteId: string;
  obra: string;
  data: string;
  trabalhador: string;
  fracao: number;
  tipo: 'PONTO' | 'VALE';
  motivo: string;
  origem: string;
  timestampOriginal?: string | null;
  horarioMensagem: string;
  mensagemOriginal?: string | null;
  sha256Hash?: string | null;
  valorDiariaBase: number;
  comprovanteUrl?: string | null;
  validadoPor?: string | null;
  validadoEm?: string | null;
}

interface MensagemGrupo {
  loteId: string;
  obra: string;
  data: string;
  origem: string;
  horarioMensagem: string;
  timestampOriginal: string | null;
  mensagemOriginal: string | null;
  sha256Hash: string | null;
  createdAt: string | null;
  itens: PendenteItem[];
}

export default function ValidacoesPage() {
  const [mensagens, setMensagens] = useState<MensagemGrupo[]>([]);
  const [dataCorteOperacional, setDataCorteOperacional] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [validandoLoteId, setValidandoLoteId] = useState<string | null>(null);
  const [validandoTodos, setValidandoTodos] = useState(false);
  const [descartandoId, setDescartandoId] = useState<string | null>(null);
  const [aplicandoCorte, setAplicandoCorte] = useState(false);
  const [mensagemExpandida, setMensagemExpandida] = useState<Record<string, boolean>>({});
  const [feedbackBanner, setFeedbackBanner] = useState<{
    tipo: 'sucesso' | 'aviso';
    titulo: string;
    descricao: string;
    undoAction?: () => void;
  } | null>(null);
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.jhoston);
  const [obrasCadastradas, setObrasCadastradas] = useState<{ id: string; nome: string }[]>([]);
  const isEmpreita = activeTenant.modo === 'EMPREITA';

  // Modal de confirmação de conflito de validação
  const [conflitoModal, setConflitoModal] = useState<{
    aberto: boolean;
    validadoPor: string;
    validadoEm?: string;
    mensagem: string;
    onConfirmar: () => void;
  } | null>(null);

  // Modal de confirmação de exclusão (item ou mensagem inteira)
  const [confirmarExclusaoModal, setConfirmarExclusaoModal] = useState<{
    modo: 'ITEM' | 'LOTE';
    titulo: string;
    descricao: string;
    onConfirmar: () => void;
  } | null>(null);

  useEffect(() => {
    fetch('/api/obras')
      .then((res) => res.json())
      .then((d: { obras?: { id: string; nome: string }[] }) =>
        setObrasCadastradas(d.obras || [])
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const nome = decodeURIComponent(userCookie.split('=')[1]);
      if (nome) setUsuarioAtual(nome);
    }
    setActiveTenant(getActiveTenantFromBrowser());
  }, []);

  async function carregarPendentes() {
    setLoading(true);
    try {
      const res = await fetch(`/api/pendentes?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        mensagens?: MensagemGrupo[];
        dataCorteOperacional?: string | null;
      };
      setMensagens(data.mensagens || []);
      setDataCorteOperacional(data.dataCorteOperacional || null);
    } catch (e) {
      console.error(e);
      setMensagens([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPendentes();
  }, []);

  function mostrarFeedback(
    tipo: 'sucesso' | 'aviso',
    titulo: string,
    descricao: string,
    undoAction?: () => void
  ) {
    setFeedbackBanner({ tipo, titulo, descricao, undoAction });
    setTimeout(() => {
      setFeedbackBanner(null);
    }, undoAction ? 6500 : 4500);
  }

  // Lista plana de todos os itens para detecção de homônimos entre obras
  const todosItens = useMemo(
    () => mensagens.flatMap((m) => m.itens),
    [mensagens]
  );

  function atualizarItemNoGrupo(
    loteId: string,
    itemId: string,
    updater: (item: PendenteItem) => PendenteItem
  ) {
    setMensagens((prev) =>
      prev.map((grupo) =>
        grupo.loteId !== loteId
          ? grupo
          : {
              ...grupo,
              itens: grupo.itens.map((it) => (it.id === itemId ? updater(it) : it)),
            }
      )
    );
  }

  function handleFracaoChange(loteId: string, itemId: string, novaFracao: number) {
    atualizarItemNoGrupo(loteId, itemId, (item) => ({ ...item, fracao: novaFracao }));
  }

  function handleDefinirMotorista(loteId: string, itemId: string) {
    atualizarItemNoGrupo(loteId, itemId, (item) => ({
      ...item,
      fracao: 1.0,
      motivo: 'VIAGEM_MOTORISTA (Condutor)',
      valorDiariaBase: item.valorDiariaBase === 120 ? 150 : item.valorDiariaBase,
    }));
  }

  async function executarValidacaoMensagem(
    grupo: MensagemGrupo,
    confirmarSobrescrita = false
  ): Promise<boolean> {
    setValidandoLoteId(grupo.loteId);
    try {
      const itensPonto = grupo.itens.filter((i) => i.tipo === 'PONTO');
      const itensVale = grupo.itens.filter((i) => i.tipo === 'VALE');

      // 1. Se for lote de ponto real, chama /api/validar
      if (itensPonto.length > 0 && !grupo.loteId.startsWith('vale-')) {
        const res = await fetch('/api/validar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loteId: grupo.loteId,
            usuarioLogado: usuarioAtual,
            confirmarSobrescrita,
            ajustes: itensPonto.map((item) => ({
              detalheId: item.id,
              lancamentoId: item.lancamentoId,
              trabalhador: item.trabalhador,
              obra: item.obra,
              fracao_dia: item.fracao,
              valor_diaria: item.valorDiariaBase,
            })),
          }),
        });

        const data = (await res.json()) as {
          conflito?: boolean;
          validadoPor?: string;
          validadoEm?: string;
          mensagem?: string;
        };

        if (res.status === 409 && data.conflito) {
          setConflitoModal({
            aberto: true,
            validadoPor: data.validadoPor || 'Outro Administrador',
            validadoEm: data.validadoEm,
            mensagem:
              data.mensagem ||
              `O registro já foi confirmado por ${data.validadoPor}. Quer continuar e alterar?`,
            onConfirmar: () => {
              setConflitoModal(null);
              void executarValidacaoMensagem(grupo, true);
            },
          });
          setValidandoLoteId(null);
          return false;
        }
      }

      // 2. Aprovar quaisquer vales vinculados a esta mensagem
      for (const v of itensVale) {
        if (!v.lancamentoId) continue;
        await fetch('/api/lancamentos/editar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lancamentoId: v.lancamentoId,
            novoValor: v.valorDiariaBase,
            status: 'VALIDADO',
            usuarioLogado: usuarioAtual,
          }),
        });
      }

      // Remove apenas esta mensagem da fila
      setMensagens((prev) => prev.filter((m) => m.loteId !== grupo.loteId));
      mostrarFeedback(
        'sucesso',
        `Mensagem das ${grupo.horarioMensagem} (${grupo.obra}) aprovada!`,
        'Os apontamentos desta mensagem foram validados e liberados para o Borderô.'
      );
      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      setValidandoLoteId(null);
    }
  }

  async function handleValidarTodasMensagens() {
    if (mensagens.length === 0) return;
    setValidandoTodos(true);
    try {
      const snapshot = [...mensagens];
      for (const grupo of snapshot) {
        const ok = await executarValidacaoMensagem(grupo, false);
        if (!ok) break; // Para se houver conflito para o usuário decidir
      }
    } finally {
      setValidandoTodos(false);
    }
  }

  function solicitarExclusaoItem(grupo: MensagemGrupo, item: PendenteItem) {
    setConfirmarExclusaoModal({
      modo: 'ITEM',
      titulo: `Excluir ${item.trabalhador}?`,
      descricao: `Este registro será descartado da mensagem das ${grupo.horarioMensagem} (${grupo.obra}) e não entrará no Borderô. A exclusão fica registrada em auditoria.`,
      onConfirmar: async () => {
        setConfirmarExclusaoModal(null);
        setDescartandoId(item.id);
        try {
          const res = await fetch('/api/pendentes/descartar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modo: 'ITEM',
              loteId: grupo.loteId,
              detalheId: item.id,
              lancamentoId: item.lancamentoId,
              trabalhador: item.trabalhador,
              usuarioLogado: usuarioAtual,
            }),
          });
          if (res.ok) {
            setMensagens((prev) =>
              prev
                .map((m) =>
                  m.loteId !== grupo.loteId
                    ? m
                    : { ...m, itens: m.itens.filter((it) => it.id !== item.id) }
                )
                .filter((m) => m.itens.length > 0)
            );
            mostrarFeedback(
              'aviso',
              `Registro de ${item.trabalhador} excluído`,
              `Removido da validação da mensagem das ${grupo.horarioMensagem} (soft delete registrado).`,
              item.lancamentoId
                ? async () => {
                    await fetch('/api/pendentes/descartar', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        modo: 'RESTAURAR',
                        loteId: grupo.loteId,
                        lancamentoId: item.lancamentoId,
                      }),
                    });
                    setFeedbackBanner(null);
                    void carregarPendentes();
                  }
                : undefined
            );
          }
        } catch (e) {
          console.error(e);
        } finally {
          setDescartandoId(null);
        }
      },
    });
  }

  function solicitarDescarteMensagem(grupo: MensagemGrupo) {
    setConfirmarExclusaoModal({
      modo: 'LOTE',
      titulo: `Descartar mensagem das ${grupo.horarioMensagem}?`,
      descricao: `Todos os ${grupo.itens.length} registro(s) desta mensagem (${grupo.obra}) serão marcados como DESCARTADO e removidos da fila de validação.`,
      onConfirmar: async () => {
        setConfirmarExclusaoModal(null);
        setDescartandoId(grupo.loteId);
        try {
          const res = await fetch('/api/pendentes/descartar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modo: 'LOTE',
              loteId: grupo.loteId,
              lancamentoId: grupo.itens[0]?.lancamentoId,
              usuarioLogado: usuarioAtual,
            }),
          });
          if (res.ok) {
            setMensagens((prev) => prev.filter((m) => m.loteId !== grupo.loteId));
            mostrarFeedback(
              'aviso',
              `Mensagem das ${grupo.horarioMensagem} descartada`,
              'A mensagem inteira foi removida da fila e registrada como DESCARTADO.'
            );
          }
        } catch (e) {
          console.error(e);
        } finally {
          setDescartandoId(null);
        }
      },
    });
  }

  async function handleAplicarCorteOntem() {
    setAplicandoCorte(true);
    try {
      const res = await fetch('/api/pendentes/corte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioLogado: `${usuarioAtual} (Corte até Ontem)` }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        dataCorte?: string;
        lotesValidados?: number;
        lancamentosValidados?: number;
      };
      if (data.success) {
        setDataCorteOperacional(data.dataCorte || null);
        mostrarFeedback(
          'sucesso',
          `Ponto de corte aplicado até ${data.dataCorte}`,
          `${data.lotesValidados || 0} mensagem(ns) e ${data.lancamentosValidados || 0} lançamento(s) anteriores foram consolidados como VALIDADO.`
        );
        await carregarPendentes();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAplicandoCorte(false);
    }
  }

  const totalGeral = todosItens.reduce(
    (acc, curr) =>
      acc +
      (curr.tipo === 'VALE'
        ? curr.valorDiariaBase
        : curr.valorDiariaBase * curr.fracao),
    0
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5 sm:space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div
              className={`flex items-center gap-2 text-[11px] sm:text-xs font-bold px-3 py-1 rounded-full w-fit border shadow-sm ${
                isEmpreita
                  ? 'text-indigo-800 bg-indigo-50 border-indigo-200/80'
                  : 'text-emerald-800 bg-emerald-50 border-emerald-200/80'
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 shrink-0 ${
                  isEmpreita ? 'text-indigo-600' : 'text-emerald-600'
                }`}
              />
              <span>
                {isEmpreita
                  ? 'Intermack • Controle de Efetivo'
                  : 'Jhoston • Validação por Mensagem'}
              </span>
            </div>
            {dataCorteOperacional && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                <Scissors className="w-3 h-3 text-slate-500" />
                <span>Corte: até {dataCorteOperacional}</span>
              </div>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
            {isEmpreita ? 'Validações de Efetivo' : 'Validações de Campo'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {isEmpreita
              ? 'Controle de presença da equipe do empreiteiro por mensagem enviada (Dia Inteiro ou Meio Dia, sem valores financeiros).'
              : 'Cada mensagem recebida no WhatsApp forma um card independente com seu horário exato. Aprove ou exclua registros individualmente.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleAplicarCorteOntem}
            disabled={aplicandoCorte}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            title="Marcar todas as mensagens enviadas até ontem como validadas e inseridas"
          >
            <Scissors className="w-3.5 h-3.5 text-slate-500" />
            <span>{aplicandoCorte ? 'Aplicando...' : 'Corte até Ontem'}</span>
          </button>

          <button
            type="button"
            onClick={carregarPendentes}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl transition-all shadow-sm shrink-0"
            title="Atualizar fila"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {mensagens.length > 1 && (
            <button
              type="button"
              onClick={handleValidarTodasMensagens}
              disabled={validandoTodos || validandoLoteId !== null}
              className="w-full sm:w-auto justify-center px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>
                {validandoTodos
                  ? 'Validando...'
                  : isEmpreita
                    ? `Aprovar Todas (${mensagens.length} msgs)`
                    : `Aprovar Todas (${mensagens.length} • R$ ${totalGeral.toFixed(2)})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-5 rounded-3xl flex items-center gap-3.5 shadow-md border ${
            feedbackBanner.tipo === 'sucesso'
              ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-2xl text-white flex items-center justify-center shrink-0 ${
              feedbackBanner.tipo === 'sucesso' ? 'bg-emerald-600' : 'bg-amber-500'
            }`}
          >
            {feedbackBanner.tipo === 'sucesso' ? (
              <Check className="w-5 h-5 stroke-[3]" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm">{feedbackBanner.titulo}</h4>
            <p className="text-xs opacity-90">{feedbackBanner.descricao}</p>
          </div>
          {feedbackBanner.undoAction && (
            <button
              type="button"
              onClick={feedbackBanner.undoAction}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shrink-0"
            >
              Desfazer
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-7 w-36 bg-slate-200 rounded-xl" />
              <div className="h-7 w-28 bg-slate-100 rounded-xl" />
            </div>
            <div className="h-16 bg-slate-100 rounded-2xl" />
            <div className="h-16 bg-slate-100 rounded-2xl" />
          </div>
        </div>
      ) : mensagens.length === 0 ? (
        <div className="bg-white p-14 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">
              Nenhuma mensagem pendente no momento!
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Todas as mensagens enviadas após o ponto de corte já foram revisadas. Cada nova mensagem do WhatsApp aparecerá aqui em seu próprio card de validação.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {mensagens.map((grupo) => {
            const subtotalMensagem = grupo.itens.reduce(
              (acc, curr) =>
                acc +
                (curr.tipo === 'VALE'
                  ? curr.valorDiariaBase
                  : curr.valorDiariaBase * curr.fracao),
              0
            );
            const isValidandoEsta = validandoLoteId === grupo.loteId;
            const isDescartandoEsta = descartandoId === grupo.loteId;
            const msgAberta = !!mensagemExpandida[grupo.loteId];

            return (
              <section
                key={grupo.loteId}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
              >
                {/* Cabeçalho da Mensagem Enviada */}
                <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/90 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-emerald-600 text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-black text-[11px] sm:text-xs shadow-sm tabular-nums">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{grupo.horarioMensagem}</span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-200 text-[11px] sm:text-xs font-black text-slate-800">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{grupo.obra}</span>
                    </div>

                    <span className="text-[11px] sm:text-xs font-semibold text-slate-500 tabular-nums">
                      📅 {grupo.data}
                    </span>

                    <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-slate-200/70">
                      📱 {grupo.origem}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    {grupo.mensagemOriginal && (
                      <button
                        type="button"
                        onClick={() =>
                          setMensagemExpandida((prev) => ({
                            ...prev,
                            [grupo.loteId]: !prev[grupo.loteId],
                          }))
                        }
                        className="flex-1 sm:flex-none justify-center px-3 py-2 sm:py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                      >
                        <MessageSquareText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{msgAberta ? 'Ocultar Texto' : 'Ver Mensagem Original'}</span>
                        {msgAberta ? (
                          <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => solicitarDescarteMensagem(grupo)}
                      disabled={isDescartandoEsta || isValidandoEsta}
                      className="p-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 rounded-xl transition-all shrink-0"
                      title="Descartar esta mensagem inteira"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Texto Original do WhatsApp (Expansível) */}
                {msgAberta && grupo.mensagemOriginal && (
                  <div className="px-4 sm:px-6 py-3.5 bg-emerald-50/50 border-b border-emerald-100 text-xs text-slate-700">
                    <span className="font-bold text-emerald-900 block mb-1">
                      Texto original recebido no WhatsApp ({grupo.timestampOriginal || grupo.horarioMensagem}):
                    </span>
                    <pre className="whitespace-pre-wrap font-sans bg-white/80 p-3 rounded-xl border border-emerald-200/60 text-slate-800 leading-relaxed">
                      {grupo.mensagemOriginal}
                    </pre>
                  </div>
                )}

                {/* Itens Extraídos desta Mensagem */}
                <div className="divide-y divide-slate-100">
                  {grupo.itens.map((item) => {
                    const valorCalculado = item.valorDiariaBase * item.fracao;
                    const isDescartandoItem = descartandoId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-5 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                              <User className="w-4 h-4 text-slate-600" />
                            </div>
                            <h3 className="text-base font-black text-slate-950 tracking-tight">
                              {item.trabalhador}
                            </h3>

                            {/* Seletor de Obra por Segurança */}
                            <div className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200/80 px-2 py-0.5 rounded-lg border border-slate-200/70 transition-all max-w-full">
                              <select
                                value={item.obra}
                                onChange={(e) => {
                                  const novaObra = e.target.value;
                                  atualizarItemNoGrupo(grupo.loteId, item.id, (it) => ({
                                    ...it,
                                    obra: novaObra,
                                  }));
                                }}
                                className="bg-transparent text-[11px] font-bold text-slate-700 cursor-pointer focus:outline-none max-w-[180px] truncate"
                                title="Confirmar ou alterar a obra deste apontamento"
                              >
                                <option value={item.obra}>{item.obra}</option>
                                {obrasCadastradas
                                  .filter((o) => o.nome !== item.obra)
                                  .map((o) => (
                                    <option key={o.id} value={o.nome}>
                                      {o.nome}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200/60 w-fit">
                              {item.motivo.toLowerCase().includes('chuva') ? (
                                <CloudRain className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                              ) : item.motivo.toLowerCase().includes('viagem') ? (
                                <Car className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                              <span>{item.motivo}</span>
                            </div>

                            {/* Alerta Preditivo de Homônimos */}
                            {todosItens.some(
                              (outro) =>
                                outro.id !== item.id &&
                                outro.trabalhador.trim().toLowerCase() ===
                                  item.trabalhador.trim().toLowerCase() &&
                                outro.obra !== item.obra
                            ) && (
                              <div className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>Presente em múltiplas obras</span>
                              </div>
                            )}

                            {/* Botão de Motorista em Dia de Viagem */}
                            {item.motivo.toLowerCase().includes('viagem') && (
                              <button
                                type="button"
                                onClick={() => handleDefinirMotorista(grupo.loteId, item.id)}
                                className={`px-3 py-1 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                                  item.motivo.includes('VIAGEM_MOTORISTA')
                                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/70'
                                }`}
                              >
                                <Car className="w-3 h-3" />
                                <span>
                                  {item.motivo.includes('VIAGEM_MOTORISTA')
                                    ? '✓ Motorista Oficial'
                                    : 'Definir como Motorista'}
                                </span>
                              </button>
                            )}

                            {item.comprovanteUrl && (
                              <ReceiptLightbox
                                comprovanteUrl={item.comprovanteUrl}
                                nomeFuncionario={item.trabalhador}
                                dataReferencia={item.data}
                              />
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5 sm:gap-3 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                          {item.tipo === 'VALE' ? (
                            <div className="flex items-center gap-2 bg-rose-50/70 p-2 rounded-2xl border border-rose-200/80">
                              <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-rose-700">
                                  Valor do Vale (R$)
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Ex: 100.00"
                                  value={
                                    item.valorDiariaBase === 0
                                      ? ''
                                      : String(item.valorDiariaBase)
                                  }
                                  onChange={(e) => {
                                    const raw = e.target.value
                                      .replace(',', '.')
                                      .replace(/[^0-9.]/g, '');
                                    const val = raw === '' ? 0 : Number(raw);
                                    atualizarItemNoGrupo(grupo.loteId, item.id, (it) => ({
                                      ...it,
                                      valorDiariaBase: Number.isNaN(val) ? 0 : val,
                                    }));
                                  }}
                                  className="w-28 px-2.5 py-1 bg-white border border-rose-200 rounded-xl text-sm font-black text-rose-950 focus:ring-2 focus:ring-rose-500 tabular-nums"
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              {!isEmpreita && (
                                <div className="text-left md:text-right pr-1">
                                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                                    A Pagar
                                  </span>
                                  <span className="text-base sm:text-lg font-black text-slate-950 tabular-nums">
                                    R$ {valorCalculado.toFixed(2)}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200/70 gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleFracaoChange(grupo.loteId, item.id, 1.0)
                                  }
                                  className={`px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    item.fracao === 1.0
                                      ? isEmpreita
                                        ? 'bg-indigo-600 text-white shadow-sm font-black'
                                        : 'bg-white text-emerald-800 shadow-sm font-black'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {isEmpreita ? 'Dia Inteiro' : '1.0'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleFracaoChange(grupo.loteId, item.id, 0.5)
                                  }
                                  className={`px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    item.fracao === 0.5
                                      ? 'bg-amber-500 text-white shadow-sm font-black'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {isEmpreita ? 'Meio Dia' : '½'}
                                </button>
                                {!isEmpreita && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleFracaoChange(grupo.loteId, item.id, 0.0)
                                    }
                                    className={`px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all ${
                                      item.fracao === 0.0
                                        ? 'bg-rose-500 text-white shadow-sm font-black'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    0
                                  </button>
                                )}
                              </div>
                            </>
                          )}

                          {/* Botão Excluir Registro Individual */}
                          <button
                            type="button"
                            onClick={() => solicitarExclusaoItem(grupo, item)}
                            disabled={isDescartandoItem || isValidandoEsta}
                            className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all shrink-0"
                            title={`Excluir ${item.trabalhador} desta validação`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Rodapé do Card: Subtotal + Ação de Aprovar Esta Mensagem */}
                <div className="px-4 sm:px-6 py-4 bg-slate-50/70 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 font-medium">
                    <span className="font-bold text-slate-700">
                      {grupo.itens.length} profissional(is)
                    </span>{' '}
                    nesta mensagem •{' '}
                    {isEmpreita ? (
                      <span className="font-black text-indigo-700 text-sm tabular-nums">
                        {grupo.itens
                          .reduce((acc, it) => acc + (it.fracao || 0), 0)
                          .toFixed(1)}{' '}
                        Homens-Dia
                      </span>
                    ) : (
                      <>
                        Subtotal:{' '}
                        <span className="font-black text-emerald-700 text-sm tabular-nums">
                          R$ {subtotalMensagem.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => executarValidacaoMensagem(grupo, false)}
                    disabled={isValidandoEsta || validandoTodos}
                    className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>
                      {isValidandoEsta
                        ? 'Validando...'
                        : `Aprovar Mensagem (${grupo.horarioMensagem})`}
                    </span>
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação de Exclusão (Item ou Mensagem) */}
      {confirmarExclusaoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  Exclusão Auditada (Soft Delete)
                </span>
                <h3 className="text-base font-black text-slate-950 mt-0.5">
                  {confirmarExclusaoModal.titulo}
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmarExclusaoModal.descricao}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmarExclusaoModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarExclusaoModal.onConfirmar}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conflito de Confirmação entre Múltiplos Administradores */}
      {conflitoModal && conflitoModal.aberto && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                  Atenção • Registro Já Validado
                </span>
                <h3 className="text-lg font-black text-slate-950 mt-1">
                  Confirmação Prévia Detectada
                </h3>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                {conflitoModal.mensagem}
              </p>
              {conflitoModal.validadoEm && (
                <p className="text-xs text-slate-500">
                  Data da aprovação:{' '}
                  {new Date(conflitoModal.validadoEm).toLocaleString('pt-BR')}
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 leading-relaxed">
              ⚠️ <strong>Regra de Governança:</strong> Se você continuar e alterar este lote, a Administradora Central <strong>Patrícia Grubel</strong> receberá um aviso imediato com todos os detalhes da edição.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConflitoModal(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={conflitoModal.onConfirmar}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-2"
              >
                <span>Sim, Quero Continuar e Editar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
