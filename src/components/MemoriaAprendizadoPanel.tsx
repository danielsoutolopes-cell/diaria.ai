'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  Plus,
  Check,
  X,
  UserCheck,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type {
  ParserLearningRuleRecord,
  SenderProfileRecord,
  TipoRegraAprendizado,
} from '@/services/aprendizadoCampoService';

interface AprendizadoApiResponse {
  success?: boolean;
  resumo?: {
    totalRegrasAtivas: number;
    totalAliases: number;
    totalPadroes: number;
    totalRemetentes: number;
  };
  rules?: ParserLearningRuleRecord[];
  senderProfiles?: SenderProfileRecord[];
}

function formatarBadgeOrigem(origem: string): {
  label: string;
  classe: string;
} {
  if (origem === 'CORRECAO_HUMANA') {
    return {
      label: 'Correção Humana',
      classe: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };
  }
  if (origem === 'AUTO_PASSAGEM_2') {
    return {
      label: 'Auto 2ª Passagem',
      classe: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (origem === 'MANUAL_ADMIN') {
    return {
      label: 'Admin',
      classe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  return {
    label: 'Oficial',
    classe: 'bg-slate-100 text-slate-600 border-slate-200',
  };
}

function formatarTipoRegra(tipo: TipoRegraAprendizado): string {
  switch (tipo) {
    case 'ALIAS_TRABALHADOR':
      return 'Apelido';
    case 'ALIAS_OBRA':
      return 'Obra';
    case 'ASSINATURA_ESTRUTURAL':
      return 'Estrutura';
    case 'EXPRESSAO_RECORRENTE':
      return 'Expressão';
    case 'FRACAO_PADRAO':
      return 'Fração';
    default:
      return tipo;
  }
}

export function MemoriaAprendizadoPanel({
  usuarioAtual = 'Administração',
}: {
  usuarioAtual?: string;
}) {
  const [expandido, setExpandido] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<ParserLearningRuleRecord[]>([]);
  const [profiles, setProfiles] = useState<SenderProfileRecord[]>([]);
  const [resumo, setResumo] = useState({
    totalRegrasAtivas: 0,
    totalAliases: 0,
    totalPadroes: 0,
    totalRemetentes: 0,
  });

  // Edição inline de regra
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editOrigem, setEditOrigem] = useState('');
  const [editDestino, setEditDestino] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Adição rápida de regra
  const [novoTipo, setNovoTipo] =
    useState<TipoRegraAprendizado>('ALIAS_TRABALHADOR');
  const [novaOrigem, setNovaOrigem] = useState('');
  const [novoDestino, setNovoDestino] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/aprendizado', { cache: 'no-store' });
      const data = (await res.json()) as AprendizadoApiResponse;
      if (data.success) {
        setRules(data.rules || []);
        setProfiles(data.senderProfiles || []);
        if (data.resumo) setResumo(data.resumo);
      }
    } catch {
      // Silencioso para não poluir tela de validação
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleAdicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novaOrigem.trim() || !novoDestino.trim()) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/aprendizado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoRegra: novoTipo,
          origemPadrao: novaOrigem.trim(),
          destinoCanonico: novoDestino.trim(),
          criadoPor: usuarioAtual,
        }),
      });
      if (res.ok) {
        setNovaOrigem('');
        setNovoDestino('');
        await carregar();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleSalvarEdicao(ruleId: string) {
    if (!editOrigem.trim() || !editDestino.trim()) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/aprendizado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId,
          origemPadrao: editOrigem.trim(),
          destinoCanonico: editDestino.trim(),
        }),
      });
      if (res.ok) {
        setEditandoId(null);
        await carregar();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(ruleId: string) {
    setSalvando(true);
    try {
      const res = await fetch(
        `/api/aprendizado?id=${encodeURIComponent(ruleId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        await carregar();
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Faixa discreta recolhida por padrão (revelação progressiva) */}
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-slate-50/80 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
            <Brain className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <span className="text-xs font-black text-slate-900 block">
              Memória de Campo (IA) — Aprendizado por Remetente
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {loading
                ? 'Carregando padrões aprendidos...'
                : `${resumo.totalAliases} apelido(s) • ${resumo.totalPadroes} padrão(ões) estrutural(is) • ${resumo.totalRemetentes} remetente(s) com perfil`}
            </span>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold shrink-0">
          <span>{expandido ? 'Recolher' : 'Ver / Ajustar'}</span>
          {expandido ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {expandido && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 space-y-4">
          {/* Perfis de Remetentes com Contexto Padrão de Obra */}
          {profiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Perfis de Remetentes &amp; Obra Padrão Sugerida</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-bold text-slate-900 truncate">
                        {p.remetente_nome}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        Obra padrão:{' '}
                        <strong className="text-emerald-700">
                          {p.obra_padrao_sugerida || 'A definir'}
                        </strong>
                      </p>
                      {(p.habitos_escrita?.enviaListaExclusivaVales ||
                        p.habitos_escrita?.usaValorExplicitoLinhaVale) && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {p.habitos_escrita?.enviaListaExclusivaVales && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                              Lista só vales (0 diárias)
                            </span>
                          )}
                          {p.habitos_escrita?.usaValorExplicitoLinhaVale && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
                              &lt;nome&gt; &lt;valor&gt; reais
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 tabular-nums shrink-0">
                      {p.total_mensagens_validadas}x
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulário rápido para adicionar apelido/padrão */}
          <form
            onSubmit={(e) => void handleAdicionar(e)}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200/80"
          >
            <select
              aria-label="Tipo de padrão"
              value={novoTipo}
              onChange={(e) =>
                setNovoTipo(e.target.value as TipoRegraAprendizado)
              }
              className="sm:col-span-3 px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800"
            >
              <option value="ALIAS_TRABALHADOR">Apelido de Trabalhador</option>
              <option value="ALIAS_OBRA">Apelido de Obra</option>
              <option value="EXPRESSAO_RECORRENTE">Expressão Recorrente</option>
              <option value="ASSINATURA_ESTRUTURAL">Padrão Estrutural</option>
            </select>
            <input
              type="text"
              value={novaOrigem}
              onChange={(e) => setNovaOrigem(e.target.value)}
              placeholder="Como chega no Zap (ex.: Lucas. J)"
              className="sm:col-span-4 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900"
            />
            <input
              type="text"
              value={novoDestino}
              onChange={(e) => setNovoDestino(e.target.value)}
              placeholder="Nome oficial (ex.: Lucas J.)"
              className="sm:col-span-3 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900"
            />
            <button
              type="submit"
              disabled={salvando || !novaOrigem.trim() || !novoDestino.trim()}
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-1 disabled:opacity-50 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Salvar</span>
            </button>
          </form>

          {/* Lista de Regras/Apelidos Aprendidos */}
          {rules.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Sparkles className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
              Nenhum padrão aprendido ainda para esta empresa. Novas correções na validação ou 2ª passagem do WhatsApp aparecerão aqui automaticamente.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto rounded-xl border border-slate-200/80">
              {rules.map((r) => {
                const badge = formatarBadgeOrigem(r.origem_aprendizado);
                const emEdicao = editandoId === r.id;

                return (
                  <div
                    key={r.id}
                    className="p-2.5 sm:px-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-white hover:bg-slate-50/70"
                  >
                    {emEdicao ? (
                      <div className="flex flex-wrap items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={editOrigem}
                          onChange={(e) => setEditOrigem(e.target.value)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs flex-1 min-w-[120px]"
                        />
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={editDestino}
                          onChange={(e) => setEditDestino(e.target.value)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs flex-1 min-w-[120px]"
                        />
                        <button
                          type="button"
                          disabled={salvando}
                          onClick={() => void handleSalvarEdicao(r.id)}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                          title="Salvar ajuste"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                          title="Cancelar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px]">
                            {formatarTipoRegra(r.tipo_regra)}
                          </span>
                          <code className="font-semibold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/70 truncate max-w-[180px]">
                            {r.origem_padrao}
                          </code>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <strong className="text-slate-900 truncate max-w-[200px]">
                            {r.destino_canonico}
                          </strong>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.classe}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {r.ocorrencias}x
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoId(r.id);
                              setEditOrigem(r.origem_padrao);
                              setEditDestino(r.destino_canonico);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                            title="Ajustar regra"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => void handleExcluir(r.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            title="Excluir regra"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
