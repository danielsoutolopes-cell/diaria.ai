'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';
import type {
  BancoExtratoSuportado,
  RelatorioConciliacaoBancaria,
  ResultadoMatchTransacao,
} from '@/services/conciliacaoBancaria';

function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

const BANCO_LABELS: Record<BancoExtratoSuportado, string> = {
  C6_BANK: 'C6 Bank',
  ITAU: 'Itaú',
  SANTANDER: 'Santander',
  OUTRO: 'Outro / Genérico',
};

export default function ConciliacaoBancariaPage() {
  const [bancoSel, setBancoSel] = useState<BancoExtratoSuportado | ''>('');
  const [nomeArquivo, setNomeArquivo] = useState<string>('');
  const [processando, setProcessando] = useState<boolean>(false);
  const [aprovandoId, setAprovandoId] = useState<string | null>(null);
  const [aprovadosIds, setAprovadosIds] = useState<Record<string, boolean>>({});
  const [relatorio, setRelatorio] =
    useState<RelatorioConciliacaoBancaria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feedbackOk, setFeedbackOk] = useState<string | null>(null);

  async function processarArquivo(file: File) {
    setProcessando(true);
    setErro(null);
    setFeedbackOk(null);
    setNomeArquivo(file.name);
    setAprovadosIds({});
    try {
      const conteudo = await file.text();
      const res = await fetch('/api/conciliacao/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analisar',
          conteudoArquivo: conteudo,
          nomeArquivo: file.name,
          banco: bancoSel || undefined,
          diasJanela: 30,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        relatorio?: RelatorioConciliacaoBancaria;
        error?: string;
      };
      if (!res.ok || !data.relatorio) {
        setErro(data.error || 'Não foi possível ler o extrato OFX/CSV.');
        return;
      }
      setRelatorio(data.relatorio);
      setFeedbackOk(
        `Extrato ${data.relatorio.formato} (${BANCO_LABELS[data.relatorio.bancoDetectado]}) analisado: ${data.relatorio.totalTransacoesSaida} saída(s) PIX/débito encontradas.`
      );
    } catch (e: unknown) {
      setErro(
        e instanceof Error ? e.message : 'Erro ao processar arquivo bancário.'
      );
    } finally {
      setProcessando(false);
    }
  }

  async function aprovarEmUmClique(item: ResultadoMatchTransacao) {
    if (!item.candidato) return;
    setAprovandoId(item.transacao.id);
    setErro(null);
    try {
      const res = await fetch('/api/conciliacao/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'aprovar-match',
          lancamentoId: item.candidato.id,
          fitId: item.transacao.fitId,
          dataTransacao: item.transacao.data,
          valorTransacao: item.transacao.valorSaida,
          descricaoExtrato: item.transacao.descricao,
          bancoExtrato: item.transacao.banco,
          nomeArquivo,
          aprovadoPor: 'Patrícia Grubel',
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setErro(data.error || 'Falha ao aprovar conciliação.');
        return;
      }
      setAprovadosIds((prev) => ({ ...prev, [item.transacao.id]: true }));
      setFeedbackOk(
        `Conciliado em 1 clique: ${item.candidato.trabalhador} (${formatBRL(item.transacao.valorSaida)}).`
      );
    } catch {
      setErro('Erro de rede ao aprovar conciliação.');
    } finally {
      setAprovandoId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Conciliação Bancária Automática • Ativa</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight">
            Conciliação OFX / CSV &amp; Matching PIX
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Envie o extrato do <strong>C6 Bank</strong>, <strong>Itaú</strong> ou <strong>Santander</strong> para cruzar automaticamente saídas PIX com diárias, vales e repasses em 1 clique.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={bancoSel}
            onChange={(e) =>
              setBancoSel(e.target.value as BancoExtratoSuportado | '')
            }
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
          >
            <option value="">Detectar banco automaticamente</option>
            <option value="C6_BANK">C6 Bank</option>
            <option value="ITAU">Itaú</option>
            <option value="SANTANDER">Santander</option>
          </select>
        </div>
      </div>

      {/* Área de Upload OFX / CSV */}
      <label className="block bg-white border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-3xl p-8 text-center cursor-pointer transition-all shadow-sm">
        <input
          type="file"
          accept=".ofx,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processarArquivo(f);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            {processando ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black text-slate-900">
              {processando
                ? 'Analisando extrato e cruzando saídas PIX...'
                : nomeArquivo
                  ? `Arquivo carregado: ${nomeArquivo} (clique para enviar outro)`
                  : 'Clique ou arraste seu extrato bancário (.OFX ou .CSV)'}
            </p>
            <p className="text-xs text-slate-500">
              Compatível com C6 Bank, Itaú e Santander • Isolamento estrito por empresa ativa
            </p>
          </div>
        </div>
      </label>

      {erro && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {feedbackOk && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackOk}</span>
        </div>
      )}

      {relatorio && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-400" />
                Saídas PIX ({BANCO_LABELS[relatorio.bancoDetectado]})
              </span>
              <div className="text-2xl font-black text-slate-950 mt-2 tabular-nums">
                {formatBRL(relatorio.totalValorSaidas)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {relatorio.totalTransacoesSaida} lançamento(s) • {relatorio.formato}
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-sm">
              <span className="text-xs font-semibold text-emerald-700">
                Match Exato Automático
              </span>
              <div className="text-2xl font-black text-emerald-700 mt-2 tabular-nums">
                {relatorio.qtdConciliadoExato}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Valor + favorecido + janela compatíveis
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-sm">
              <span className="text-xs font-semibold text-amber-700">
                Sugestões p/ Validar
              </span>
              <div className="text-2xl font-black text-amber-700 mt-2 tabular-nums">
                {relatorio.qtdSugestaoMatch}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Aprovação Human-in-the-Loop em 1 clique
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-rose-200 shadow-sm">
              <span className="text-xs font-semibold text-rose-700">
                Divergências / Sem Par
              </span>
              <div className="text-2xl font-black text-rose-700 mt-2 tabular-nums">
                {relatorio.qtdDivergencias}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Saídas bancárias sem registro no sistema
              </p>
            </div>
          </div>

          {/* Tabela de Cruzamento */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Resultado do Matching Inteligente PIX</span>
              </h2>
              <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                {relatorio.itens.length} item(ns)
              </span>
            </div>

            {relatorio.itens.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Nenhuma saída PIX/débito identificada no arquivo enviado.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {relatorio.itens.map((item) => {
                  const jaAprovado = aprovadosIds[item.transacao.id] === true;
                  const badgeClass =
                    item.statusMatch === 'CONCILIADO_EXATO'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : item.statusMatch === 'SUGESTAO_MATCH'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200';
                  return (
                    <div
                      key={item.transacao.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${badgeClass}`}
                          >
                            {item.statusMatch === 'CONCILIADO_EXATO'
                              ? `Match Exato (${item.score}%)`
                              : item.statusMatch === 'SUGESTAO_MATCH'
                                ? `Sugestão (${item.score}%)`
                                : 'Divergência'}
                          </span>
                          <span className="text-xs font-bold text-slate-500 tabular-nums">
                            {item.transacao.data}
                          </span>
                          <span className="text-sm font-black text-slate-950">
                            {item.transacao.favorecidoDetectado}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Extrato: <strong>{item.transacao.descricao}</strong>
                        </p>
                        <p className="text-[11px] text-slate-500">{item.motivo}</p>
                        {item.candidato && (
                          <p className="text-[11px] text-emerald-700 font-semibold">
                            Par no sistema: {item.candidato.trabalhador} •{' '}
                            {item.candidato.tipo} ({item.candidato.obra}) em{' '}
                            {item.candidato.data} —{' '}
                            {formatBRL(item.candidato.valor)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-base font-black text-slate-950 tabular-nums">
                          {formatBRL(item.transacao.valorSaida)}
                        </span>

                        {item.candidato &&
                          item.candidato.origem === 'LANCAMENTO_FINANCEIRO' && (
                            <button
                              type="button"
                              disabled={
                                jaAprovado || aprovandoId === item.transacao.id
                              }
                              onClick={() => void aprovarEmUmClique(item)}
                              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                                jaAprovado
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-950 hover:bg-emerald-700 text-white shadow-sm'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {jaAprovado
                                  ? 'Conciliado'
                                  : aprovandoId === item.transacao.id
                                    ? 'Salvando...'
                                    : 'Aprovar em 1 clique'}
                              </span>
                            </button>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
