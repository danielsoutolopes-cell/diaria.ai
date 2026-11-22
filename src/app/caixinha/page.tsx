'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  ShieldCheck,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import CaixaCampoPanel from '@/components/CaixaCampoPanel';
import {
  getActiveTenantFromBrowser,
  TENANTS,
  type TenantConfig,
} from '@/lib/tenant';

interface ContaResumo {
  encarregado: string;
  aliasesUnificados?: string[];
  possuiPreImplantacao?: boolean;
  totalRecebido: number;
  totalComprovado: number;
  totalDevolvido: number;
  saldoEmMaos: number;
}

function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export default function CaixinhaPage() {
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.jhoston);
  const [contas, setContas] = useState<ContaResumo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregarResumo() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch('/api/caixa-campo', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Não foi possível carregar o Caixinha de Campo.');
      }
      const data = (await res.json()) as { contas?: ContaResumo[] };
      setContas(data.contas || []);
    } catch (err: unknown) {
      setErro(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar dados do Caixinha de Campo.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setActiveTenant(getActiveTenantFromBrowser());
    void carregarResumo();
  }, []);

  const totalEntradas = contas.reduce((acc, c) => acc + c.totalRecebido, 0);
  const totalSaidas = contas.reduce((acc, c) => acc + c.totalComprovado, 0);
  const totalTrocoEmMaos = contas.reduce((acc, c) => acc + c.saldoEmMaos, 0);

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho SaaS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              <Wallet className="w-3.5 h-3.5 text-amber-600" />
              <span>{activeTenant.nome} • Caixinha de Campo Unificado</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Sem desconto automático na folha</span>
            </span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Caixinha de Campo
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Conta corrente unificada de verbas operacionais em mãos dos encarregados (com preservação de saldos pré-implantação e conciliação 100% humana).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void carregarResumo()}
            disabled={loading}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
          <Link
            href="/reembolsos"
            className="px-4 py-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Reembolsos Avulsos</span>
          </Link>
        </div>
      </div>

      {/* Estado de Erro */}
      {erro && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">
          {erro}
        </div>
      )}

      {/* KPIs Consolidados (tabular-nums) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Entradas PIX (Suprimentos)</span>
            <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
          </div>
          {loading ? (
            <div className="h-8 w-32 bg-slate-100 rounded-lg animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-black text-emerald-700 tabular-nums mt-2">
              {formatBRL(totalEntradas)}
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            Total repassado para despesas de campo
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Saídas / Notas Comprovadas</span>
            <ArrowUpCircle className="w-4 h-4 text-rose-500" />
          </div>
          {loading ? (
            <div className="h-8 w-32 bg-slate-100 rounded-lg animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-black text-rose-700 tabular-nums mt-2">
              {formatBRL(totalSaidas)}
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            Notas fiscais, materiais e locações prestadas
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-amber-200/90 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-amber-800">
            <span>Troco em Mãos (Saldo Consolidado)</span>
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          {loading ? (
            <div className="h-8 w-32 bg-amber-100/70 rounded-lg animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-black text-amber-900 tabular-nums mt-2">
              {formatBRL(totalTrocoEmMaos)}
            </p>
          )}
          <p className="text-[11px] text-amber-700/80 mt-1">
            Mantido em coluna própria até decisão manual
          </p>
        </div>
      </div>

      {/* Painel Interativo Unificado */}
      <CaixaCampoPanel />
    </div>
  );
}
