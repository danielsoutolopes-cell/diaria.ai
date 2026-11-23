'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { EmissorPixCaixinhaConfig } from '@/lib/caixinhaPixRastreabilidade';

interface EmissoresApiResponse {
  success?: boolean;
  emissores?: EmissorPixCaixinhaConfig[];
  emissoresAtivos?: string[];
  message?: string;
  error?: string;
}

export default function EmissoresPixCaixinhaSetup() {
  const [emissores, setEmissores] = useState<EmissorPixCaixinhaConfig[]>([]);
  const [novoNome, setNovoNome] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/caixa-campo/emissores', {
        cache: 'no-store',
      });
      const data = (await res.json()) as EmissoresApiResponse;
      if (data.emissores) {
        setEmissores(data.emissores);
      }
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Não foi possível carregar os emissores de PIX da Caixinha.',
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleAdicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novoNome.trim()) return;
    setSalvando(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/caixa-campo/emissores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adicionar',
          nome: novoNome.trim(),
        }),
      });
      const data = (await res.json()) as EmissoresApiResponse;
      if (!res.ok) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Erro ao adicionar emissor de PIX.',
        });
        return;
      }
      if (data.emissores) setEmissores(data.emissores);
      setNovoNome('');
      setFeedback({
        tipo: 'sucesso',
        texto: data.message || 'Emissor adicionado com sucesso.',
      });
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Falha de conexão ao salvar novo emissor.',
      });
    } finally {
      setSalvando(false);
    }
  }

  async function handleAlternar(item: EmissorPixCaixinhaConfig) {
    if (item.padrao) return;
    setOcupadoId(item.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/caixa-campo/emissores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'alternar',
          id: item.id,
          ativo: !item.ativo,
        }),
      });
      const data = (await res.json()) as EmissoresApiResponse;
      if (!res.ok) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Erro ao atualizar status do emissor.',
        });
        return;
      }
      if (data.emissores) setEmissores(data.emissores);
      setFeedback({
        tipo: 'sucesso',
        texto: data.message || 'Status atualizado.',
      });
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Falha ao atualizar status do emissor.',
      });
    } finally {
      setOcupadoId(null);
    }
  }

  async function handleRemover(item: EmissorPixCaixinhaConfig) {
    if (item.padrao) return;
    setOcupadoId(item.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/caixa-campo/emissores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remover',
          id: item.id,
        }),
      });
      const data = (await res.json()) as EmissoresApiResponse;
      if (!res.ok) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Erro ao remover emissor.',
        });
        return;
      }
      if (data.emissores) setEmissores(data.emissores);
      setFeedback({
        tipo: 'sucesso',
        texto: data.message || 'Emissor removido.',
      });
    } catch {
      setFeedback({
        tipo: 'erro',
        texto: 'Falha ao remover emissor.',
      });
    } finally {
      setOcupadoId(null);
    }
  }

  const ativosCount = emissores.filter((e) => e.ativo || e.padrao).length;

  return (
    <section
      id="emissores-pix-caixinha"
      className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase tracking-wider">
            <Wallet className="w-3.5 h-3.5" />
            <span>Caixinha de Campo • Jhoston</span>
          </div>
          <h2 className="text-lg font-black text-slate-950">
            Emissores de PIX da Caixinha de Campo
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl">
            Gerencie quem pode enviar suprimentos PIX para o Caixinha de Campo.{' '}
            <strong>Patrícia</strong> e <strong>Joabson</strong> vêm ativos por
            padrão; os emissores adicionais ativos alimentam automaticamente o
            dropdown <em>Emissor / Quem Enviou o PIX</em> no <code>/caixinha</code>{' '}
            (sem alterar o fluxo de vales dos funcionários).
          </p>
        </div>

        <div className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl shrink-0 tabular-nums">
          {ativosCount} ativo(s) no seletor
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {/* Formulário para adicionar novo emissor */}
      <form
        onSubmit={handleAdicionar}
        className="flex flex-col sm:flex-row gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80"
      >
        <input
          type="text"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Novo emissor de PIX (ex.: Daniel, Conta Empresa, Financeiro...)"
          className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
        />
        <button
          type="submit"
          disabled={salvando || !novoNome.trim()}
          className="px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          {salvando ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>Adicionar Emissor</span>
        </button>
      </form>

      {/* Lista de emissores (padrões + adicionais) */}
      {carregando ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-12 rounded-2xl bg-slate-100" />
          <div className="h-12 rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {emissores.map((item) => {
            const busy = ocupadoId === item.id;
            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                  item.ativo || item.padrao
                    ? 'bg-white border-slate-200 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200/70 opacity-75'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      item.ativo || item.padrao
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">
                      {item.nome}
                    </p>
                    <span
                      className={`text-[10px] font-bold ${
                        item.padrao
                          ? 'text-emerald-700'
                          : item.ativo
                            ? 'text-sky-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {item.padrao
                        ? 'Padrão obrigatório'
                        : item.ativo
                          ? 'Ativo no seletor'
                          : 'Inativo'}
                    </span>
                  </div>
                </div>

                {item.padrao ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black shrink-0">
                    <ShieldCheck className="w-3 h-3" />
                    Padrão
                  </span>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAlternar(item)}
                      className={`px-2 py-1 rounded-lg border text-[10px] font-black flex items-center gap-1 transition-all ${
                        item.ativo
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                      title={item.ativo ? 'Desativar emissor' : 'Ativar emissor'}
                    >
                      <Power className="w-3 h-3" />
                      <span>{busy ? '...' : item.ativo ? 'Ativo' : 'Ativar'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemover(item)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remover emissor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
