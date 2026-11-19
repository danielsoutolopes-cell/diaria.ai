'use client';

import React, { useState, useEffect } from 'react';
import {
  FileUp,
  Sparkles,
  Building2,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Users,
  ClipboardList,
} from 'lucide-react';
import {
  getActiveTenantFromBrowser,
  TENANTS,
  type TenantConfig,
} from '@/lib/tenant';

interface EtapaObra {
  id: string;
  nome: string;
  pesoPercentual: number;
  percentualConcluido: number;
  observacao: string;
}

interface ObraEscopoMedicao {
  id: string;
  tenantSlug: string;
  obraNome: string;
  cliente: string;
  empreiteiro: string;
  prazoEstimado: string;
  etapas: EtapaObra[];
  parecerIA: string;
  homensDiaAcumulados: number;
  ultimaAvaliacaoEm?: string;
  criadoEm: string;
}

export default function MedicoesPage() {
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.intermack);
  const [escopos, setEscopos] = useState<ObraEscopoMedicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [extraindo, setExtraindo] = useState(false);
  const [avaliandoId, setAvaliandoId] = useState<string | null>(null);

  // Upload de Proposta (PDF/Imagem ou Texto colado) + Vínculo com Obra
  const [obrasExistentes, setObrasExistentes] = useState<Array<{ id: string; nome: string }>>([]);
  const [obraSelecionada, setObraSelecionada] = useState<string>('');
  const [textoProposta, setTextoProposta] = useState('');
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [arquivoMimeType, setArquivoMimeType] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);

  useEffect(() => {
    setActiveTenant(getActiveTenantFromBrowser());
    void carregar();
    fetch('/api/obras', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { obras?: Array<{ id: string; nome: string }> }) => {
        setObrasExistentes(d.obras || []);
      })
      .catch(() => {});
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch('/api/medicoes');
      const d = (await res.json()) as { escopos?: ObraEscopoMedicao[] };
      setEscopos(d.escopos || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArquivoNome(file.name);
    setArquivoMimeType(file.type || 'application/pdf');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setArquivoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleExtrairProposta(e: React.FormEvent) {
    e.preventDefault();
    if (!textoProposta.trim() && !arquivoBase64) return;
    setExtraindo(true);
    try {
      const res = await fetch('/api/medicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair-proposta',
          obraNomeSelecionada: obraSelecionada || undefined,
          textoProposta,
          arquivoBase64,
          arquivoMimeType,
        }),
      });
      const d = (await res.json()) as { escopos?: ObraEscopoMedicao[] };
      if (d.escopos) {
        setEscopos(d.escopos);
        setTextoProposta('');
        setArquivoBase64(null);
        setArquivoMimeType(null);
        setArquivoNome(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExtraindo(false);
    }
  }

  async function handleAvaliarIA(escopoId: string) {
    setAvaliandoId(escopoId);
    try {
      const res = await fetch('/api/medicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'avaliar-ia', escopoId }),
      });
      const d = (await res.json()) as { escopos?: ObraEscopoMedicao[] };
      if (d.escopos) setEscopos(d.escopos);
    } catch (err) {
      console.error(err);
    } finally {
      setAvaliandoId(null);
    }
  }

  async function handleAtualizarPercentual(
    escopo: ObraEscopoMedicao,
    etapaId: string,
    novoPercentual: number
  ) {
    const novasEtapas = escopo.etapas.map((et) =>
      et.id === etapaId ? { ...et, percentualConcluido: novoPercentual } : et
    );
    setEscopos((prev) =>
      prev.map((e) => (e.id === escopo.id ? { ...e, etapas: novasEtapas } : e))
    );
    await fetch('/api/medicoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'atualizar-etapas',
        escopoId: escopo.id,
        etapas: novasEtapas,
      }),
    });
  }

  async function handleExcluir(escopoId: string) {
    const res = await fetch('/api/medicoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'excluir', escopoId }),
    });
    const d = (await res.json()) as { escopos?: ObraEscopoMedicao[] };
    if (d.escopos) setEscopos(d.escopos);
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-2 text-xs font-bold text-indigo-800 bg-indigo-50 px-3 py-1 rounded-full w-fit mb-2 border border-indigo-200">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{activeTenant.nome} • Assistente de Medição por IA</span>
        </div>
        <h1 className="text-3xl font-black text-slate-950 tracking-tight">
          Propostas, Etapas & Medição IA
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Suba a proposta da obra (PDF, foto ou texto). A IA extrai as etapas e estima o % concluído cruzando os Diários de Obra e Homens-Dia — sem precisar ser engenheiro.
        </p>
      </div>

      {/* Upload de Proposta */}
      <form
        onSubmit={handleExtrairProposta}
        className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
          <FileUp className="w-4 h-4 text-indigo-600" />
          <span>Subir Proposta da Obra para Leitura Automática</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            Vincular a uma Obra de {activeTenant.nome} (ou criar automaticamente ao ler a proposta)
          </label>
          <select
            value={obraSelecionada}
            onChange={(e) => setObraSelecionada(e.target.value)}
            className="w-full sm:max-w-md px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">
              ✨ Criar obra automaticamente a partir da proposta
            </option>
            {obrasExistentes.map((o) => (
              <option key={o.id} value={o.nome}>
                🏗️ {o.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Arquivo da Proposta (PDF ou Imagem)
            </label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={handleArquivoChange}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
            />
            {arquivoNome && (
              <p className="text-[11px] font-bold text-emerald-700">
                ✓ Arquivo carregado: {arquivoNome}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Ou cole o texto / escopo da proposta
            </label>
            <textarea
              rows={3}
              placeholder="Cole aqui os itens da proposta (ex: Demolição, Alvenaria, Elétrica, Pintura...)"
              value={textoProposta}
              onChange={(e) => setTextoProposta(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={extraindo || (!textoProposta.trim() && !arquivoBase64)}
          className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-2 shadow-md disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>
            {extraindo
              ? 'Lendo proposta com IA...'
              : 'Ler Proposta e Gerar Etapas com IA'}
          </span>
        </button>
      </form>

      {/* Lista de Obras com Medição IA */}
      {loading ? (
        <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
          Carregando obras e medições...
        </div>
      ) : escopos.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-2">
          <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">
            Nenhuma proposta importada ainda.
          </p>
          <p className="text-xs text-slate-500">
            Suba acima o PDF ou texto das 2 obras da Intermack para a IA montar o painel de acompanhamento.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {escopos.map((esc) => {
            const totalPeso = esc.etapas.reduce(
              (acc, et) => acc + (et.pesoPercentual || 0),
              0
            );
            const avancoGlobal =
              totalPeso > 0
                ? esc.etapas.reduce(
                    (acc, et) =>
                      acc +
                      (et.percentualConcluido * (et.pesoPercentual || 0)) /
                        totalPeso,
                    0
                  )
                : 0;

            return (
              <section
                key={esc.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                      <h2 className="text-lg font-black text-slate-950">
                        {esc.obraNome}
                      </h2>
                      <span className="text-xs font-black bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">
                        {avancoGlobal.toFixed(0)}% Concluído
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Cliente: <strong>{esc.cliente}</strong> • Empreiteiro:{' '}
                      <strong>{esc.empreiteiro}</strong> • Prazo:{' '}
                      <strong>{esc.prazoEstimado}</strong> •{' '}
                      <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                        <Users className="w-3 h-3" />
                        {esc.homensDiaAcumulados.toFixed(1)} Homens-Dia
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAvaliarIA(esc.id)}
                      disabled={avaliandoId === esc.id}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          avaliandoId === esc.id ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {avaliandoId === esc.id
                          ? 'Analisando Diários...'
                          : 'Estimar Avanço com IA'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExcluir(esc.id)}
                      className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Parecer em linguagem humana */}
                <div className="px-6 py-3.5 bg-indigo-50/50 border-b border-indigo-100 text-xs text-indigo-950 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Parecer da IA:</strong> {esc.parecerIA}
                  </p>
                </div>

                {/* Etapas com ajuste manual (Human-in-the-Loop) */}
                <div className="p-6 space-y-4">
                  {esc.etapas.map((et) => (
                    <div key={et.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">
                          {et.nome}{' '}
                          <span className="text-slate-400 font-medium">
                            (peso {et.pesoPercentual}%)
                          </span>
                        </span>
                        <span className="font-black text-indigo-700">
                          {et.percentualConcluido}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={et.percentualConcluido}
                        onChange={(e) =>
                          handleAtualizarPercentual(
                            esc,
                            et.id,
                            Number(e.target.value)
                          )
                        }
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                      {et.observacao && (
                        <p className="text-[11px] text-slate-500">
                          {et.observacao}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
