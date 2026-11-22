'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart,
  Sparkles,
  Copy,
  Check,
  Send,
  RefreshCw,
  Building2,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react';
import {
  getActiveTenantFromBrowser,
  isDanielOuPatricia,
  setActiveTenantInBrowser,
  TENANTS,
  type TenantConfig,
} from '@/lib/tenant';
import type {
  CategoriaCompra,
  PedidoCompraRecord,
  StatusPedidoCompra,
} from '@/services/pedidosComprasNlp';

interface ComprasApiResponse {
  success?: boolean;
  tenant?: { id: string; slug: string; nome: string; razaoSocial: string };
  moduloComprasAtivo?: boolean;
  obras?: string[];
  pedidos?: PedidoCompraRecord[];
  error?: string;
}

const STATUS_LABELS: Record<StatusPedidoCompra, { label: string; style: string }> = {
  NOVO: {
    label: 'Novo',
    style: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  ENVIADO_PATRICIA: {
    label: 'Enviado p/ Patrícia',
    style: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  EM_COTACAO: {
    label: 'Em Cotação',
    style: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  COMPRADO: {
    label: 'Comprado',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  ENTREGUE: {
    label: 'Entregue na Obra',
    style: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  CANCELADO: {
    label: 'Cancelado',
    style: 'bg-slate-100 text-slate-500 border-slate-200',
  },
};

export default function ComprasPage() {
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.jhoston);
  const [currentUser, setCurrentUser] = useState<string>('Patrícia Grubel');
  const [moduloAtivo, setModuloAtivo] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [obras, setObras] = useState<string[]>([]);
  const [pedidos, setPedidos] = useState<PedidoCompraRecord[]>([]);

  // Formulário de geração
  const [obraSelecionada, setObraSelecionada] = useState<string>('');
  const [solicitadoPor, setSolicitadoPor] = useState<string>('Encarregado de Obra');
  const [textoPedido, setTextoPedido] = useState<string>('');
  const [enviarZapPatricia, setEnviarZapPatricia] = useState<boolean>(true);
  const [gerando, setGerando] = useState<boolean>(false);

  // Estados de ação/feedback
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [atualizandoStatusId, setAtualizandoStatusId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/compras', { cache: 'no-store' });
      const data = (await res.json()) as ComprasApiResponse;
      if (res.ok && data.success) {
        setModuloAtivo(Boolean(data.moduloComprasAtivo));
        const listaObras = data.obras || [];
        setObras(listaObras);
        setObraSelecionada((prev) => prev || listaObras[0] || 'Obra Intermack');
        setPedidos(data.pedidos || []);
      }
    } catch (err) {
      console.error('Erro ao carregar pedidos de compras:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tenant = getActiveTenantFromBrowser();
    setActiveTenant(tenant);
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const raw = userCookie.split('=')[1] || '';
      try {
        setCurrentUser(decodeURIComponent(decodeURIComponent(raw)).trim());
      } catch {
        setCurrentUser(decodeURIComponent(raw).replace(/%20/g, ' ').trim());
      }
    }
    void carregarDados();
  }, [carregarDados]);

  const isAdmin = isDanielOuPatricia(currentUser);

  async function handleGerarPedido(e: React.FormEvent) {
    e.preventDefault();
    if (!textoPedido.trim()) return;
    setGerando(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gerar',
          obraNome: obraSelecionada || 'Obra Intermack',
          textoOriginal: textoPedido,
          solicitadoPor: solicitadoPor || currentUser,
          enviarWhatsappPatricia: enviarZapPatricia,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        motor?: string;
        enviadoPatricia?: boolean;
        pedidos?: PedidoCompraRecord[];
        error?: string;
      };

      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao gerar pedido de compras.',
        });
        return;
      }

      if (data.pedidos) setPedidos(data.pedidos);
      setTextoPedido('');
      setFeedback({
        tipo: 'sucesso',
        texto: data.enviadoPatricia
          ? `Pedido agrupado por categoria (${data.motor}) e enviado no WhatsApp da Patrícia!`
          : `Pedido agrupado por categoria (${data.motor}) e pronto para copiar e colar!`,
      });
    } catch (err: unknown) {
      setFeedback({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Erro ao processar pedido.',
      });
    } finally {
      setGerando(false);
    }
  }

  async function handleReenviarPatricia(pedidoId: string) {
    setReenviandoId(pedidoId);
    setFeedback(null);
    try {
      const res = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reenviar-patricia', pedidoId }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        pedidos?: PedidoCompraRecord[];
      };
      if (data.pedidos) setPedidos(data.pedidos);
      setFeedback({
        tipo: data.success ? 'sucesso' : 'erro',
        texto: data.message || 'Envio processado.',
      });
    } finally {
      setReenviandoId(null);
    }
  }

  async function handleAlterarStatus(
    pedidoId: string,
    novoStatus: StatusPedidoCompra
  ) {
    setAtualizandoStatusId(pedidoId);
    try {
      const res = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'atualizar-status',
          pedidoId,
          status: novoStatus,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        pedidos?: PedidoCompraRecord[];
      };
      if (res.ok && data.pedidos) {
        setPedidos(data.pedidos);
      }
    } finally {
      setAtualizandoStatusId(null);
    }
  }

  function handleCopiarMensagem(pedido: PedidoCompraRecord) {
    navigator.clipboard.writeText(pedido.mensagemFormatada);
    setCopiadoId(pedido.id);
    setTimeout(() => setCopiadoId(null), 2500);
  }

  const pedidosFiltrados =
    filtroStatus === 'TODOS'
      ? pedidos
      : pedidos.filter((p) => p.status === filtroStatus);

  // Modo Standby para Jhoston (modulo_compras_ativo = false)
  if (!loading && !moduloAtivo) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-5 text-center">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <PauseCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-black uppercase">
              Standby • modulo_compras_ativo = false
            </span>
            <h1 className="text-2xl font-black text-slate-950">
              Gerador de Pedidos de Compras em Standby ({activeTenant.nome})
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Na empresa <strong>{activeTenant.nome}</strong>, este módulo permanece em
              standby para manter o fluxo de diárias e folha enxuto. O monitoramento
              automático de grupos por obra com agrupamento IA está ativo na{' '}
              <strong>Intermack Engenharia e Construção</strong>.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setActiveTenantInBrowser('intermack');
                window.location.reload();
              }}
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black inline-flex items-center gap-2 shadow-sm active:scale-95 transition-all"
            >
              <Building2 className="w-4 h-4" />
              <span>Alternar para Intermack (Ativar Compras IA)</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShoppingCart className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
              {activeTenant.nome} • Compras Inteligentes por Grupo de Obra
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 mt-1">
            Gerador Inteligente de Pedido de Compras
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Monitoramento automático de grupos da obra + agrupamento de itens por categoria via Gemini AI, pronto para copiar e encaminhar no WhatsApp.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void carregarDados()}
          disabled={loading}
          className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 flex items-center gap-2 shadow-sm self-start md:self-center"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Pedidos</span>
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.texto}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Formulário de Geração Inteligente */}
      <form
        onSubmit={handleGerarPedido}
        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-slate-950 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Novo Pedido de Materiais (Texto Livre / WhatsApp)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Cole a lista informal enviada pelo mestre/encarregado — a IA separa Alvenaria, Hidráulica, Elétrica, Acabamento, Pintura e EPIs automaticamente.
            </p>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            Monitoramento de Grupos WhatsApp: ATIVO
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Obra / Canteiro
            </label>
            {obras.length > 0 ? (
              <select
                value={obraSelecionada}
                onChange={(e) => setObraSelecionada(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {obras.map((ob) => (
                  <option key={ob} value={ob}>
                    {ob}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={obraSelecionada}
                onChange={(e) => setObraSelecionada(e.target.value)}
                placeholder="Nome da obra (ex: Reforma Corporativa Faria Lima)"
                className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Solicitado por
            </label>
            <input
              type="text"
              value={solicitadoPor}
              onChange={(e) => setSolicitadoPor(e.target.value)}
              placeholder="Nome do encarregado ou engenheiro"
              className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">
            Lista Informal de Materiais
          </label>
          <textarea
            rows={4}
            value={textoPedido}
            onChange={(e) => setTextoPedido(e.target.value)}
            placeholder="Ex: Bom dia, estamos precisando urgente de 20 sacos de cimento, 10 sacos argamassa AC3, 3 rolos de fio 2.5mm azul, 6 tubos pvc 50mm, 2 discos de corte porcelanato e 4 pares de luva."
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none leading-relaxed"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={enviarZapPatricia}
              onChange={(e) => setEnviarZapPatricia(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              Disparar mensagem formatada automaticamente no WhatsApp da Patrícia
            </span>
          </label>

          <button
            type="submit"
            disabled={gerando || !textoPedido.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-indigo-700/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {gerando
                ? 'Agrupando Itens com IA...'
                : 'Agrupar por Categoria & Gerar Pedido'}
            </span>
          </button>
        </div>
      </form>

      {/* Histórico de Pedidos Agrupados */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-950 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" />
            <span>Pedidos Gerados ({pedidosFiltrados.length})</span>
          </h2>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['TODOS', 'NOVO', 'ENVIADO_PATRICIA', 'EM_COTACAO', 'COMPRADO', 'ENTREGUE'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFiltroStatus(st)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                    filtroStatus === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st === 'TODOS' ? 'Todos' : STATUS_LABELS[st].label}
                </button>
              )
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Carregando pedidos de compras...</p>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-2">
            <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-black text-slate-800">
              Nenhum pedido de compras encontrado
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Cole uma lista de materiais no formulário acima ou envie uma lista diretamente em um grupo de obra da Intermack no WhatsApp.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {pedidosFiltrados.map((pedido) => {
              const categorias = new Map<CategoriaCompra, typeof pedido.itens>();
              pedido.itens.forEach((it) => {
                const arr = categorias.get(it.categoria) || [];
                arr.push(it);
                categorias.set(it.categoria, arr);
              });
              const statusMeta = STATUS_LABELS[pedido.status] || STATUS_LABELS.NOVO;

              return (
                <div
                  key={pedido.id}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
                >
                  <div className="p-5 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 text-[11px] font-bold">
                          {pedido.obraNome}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${statusMeta.style}`}
                        >
                          {statusMeta.label}
                        </span>
                        {pedido.grupoJid && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                            Capturado do Grupo WhatsApp
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {new Date(pedido.criadoEm).toLocaleString('pt-BR')} •
                          Solicitado por <strong>{pedido.solicitadoPor}</strong> •{' '}
                          {pedido.itens.length} item(ns)
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={pedido.status}
                        disabled={atualizandoStatusId === pedido.id}
                        onChange={(e) =>
                          void handleAlterarStatus(
                            pedido.id,
                            e.target.value as StatusPedidoCompra
                          )
                        }
                        className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white outline-none"
                      >
                        {(Object.keys(STATUS_LABELS) as StatusPedidoCompra[]).map(
                          (st) => (
                            <option key={st} value={st}>
                              {STATUS_LABELS[st].label}
                            </option>
                          )
                        )}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleCopiarMensagem(pedido)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        {copiadoId === pedido.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar WhatsApp</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={reenviandoId === pedido.id}
                        onClick={() => void handleReenviarPatricia(pedido.id)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {reenviandoId === pedido.id
                            ? 'Enviando...'
                            : 'Enviar Patrícia'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Itens agrupados por categoria + preview copiável */}
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                        Itens Agrupados por Categoria ({categorias.size})
                      </span>
                      {Array.from(categorias.entries()).map(([cat, lista]) => (
                        <div
                          key={cat}
                          className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2"
                        >
                          <div className="text-xs font-black text-indigo-900">
                            {cat}
                          </div>
                          <ul className="space-y-1">
                            {lista.map((it, idx) => (
                              <li
                                key={`${cat}-${idx}`}
                                className="text-xs text-slate-700 flex items-center justify-between gap-2"
                              >
                                <span>
                                  <strong className="tabular-nums text-slate-950">
                                    {it.quantidade} {it.unidade}
                                  </strong>{' '}
                                  — {it.nome}
                                </span>
                                {it.urgencia === 'ALTA' && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black">
                                    URGENTE
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                        Mensagem Formatada (Pronta p/ Copiar e Colar)
                      </span>
                      <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-200 text-[11px] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-72">
                        {pedido.mensagemFormatada}
                      </pre>
                    </div>
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
