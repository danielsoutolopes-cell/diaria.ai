'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, Download, Send, CheckSquare, Square } from 'lucide-react';

type ModoConteudo = 'PRESENCA' | 'DIARIAS' | 'VALES' | 'COMPLETO';

interface CelulaDia {
  fracao: number;
  tipo: string;
  obs: string;
  valor: number;
  pago?: boolean;
  valeDia?: number;
}

interface LinhaEspelho {
  nome: string;
  dias: Record<number, CelulaDia>;
  totalDias: number;
  totalValor: number;
  totalPago?: number;
  totalVales?: number;
  saldoAPagar?: number;
}

interface Destinatario {
  id: string;
  nome: string;
  telefone: string;
}

export default function RelatorioPersonalizadoBuilder() {
  const [mes, setMes] = useState<string>('2026-11');
  const [obraId, setObraId] = useState<string>('TODAS');
  const [periodo, setPeriodo] = useState<'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'ANUAL'>('MENSAL');
  const [modoConteudo, setModoConteudo] = useState<ModoConteudo>('PRESENCA');

  const [obras, setObras] = useState<Array<{ id: string; nome: string }>>([]);
  const [diasNoMes, setDiasNoMes] = useState<number>(30);
  const [linhas, setLinhas] = useState<LinhaEspelho[]>([]);
  const [nomesSelecionados, setNomesSelecionados] = useState<string[]>([]);
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([
    { id: 'patricia', nome: 'Patrícia Grubel', telefone: '5511978543369' },
    { id: 'daniel', nome: 'Daniel Lopes', telefone: '5511988139833' },
    { id: 'joabson', nome: 'Joabson', telefone: '' },
  ]);
  const [destId, setDestId] = useState<string>('patricia');
  const [telefoneCustom, setTelefoneCustom] = useState<string>('');
  const [processando, setProcessando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [rEsp, rDest] = await Promise.all([
        fetch(`/api/relatorios/espelho?mes=${encodeURIComponent(mes)}&obraId=${encodeURIComponent(obraId)}`, { cache: 'no-store' }),
        fetch('/api/relatorios/personalizado', { cache: 'no-store' }),
      ]);
      const dEsp = (await rEsp.json()) as {
        obras?: Array<{ id: string; nome: string }>;
        diasNoMes?: number;
        linhas?: LinhaEspelho[];
      };
      const dDest = (await rDest.json()) as { destinatarios?: Destinatario[] };
      setObras(dEsp.obras || []);
      setDiasNoMes(dEsp.diasNoMes || 30);
      const l = dEsp.linhas || [];
      setLinhas(l);
      setNomesSelecionados(l.map((x) => x.nome));
      if (dDest.destinatarios && dDest.destinatarios.length > 0) {
        setDestinatarios(dDest.destinatarios);
      }
    } catch {
      // ignora
    }
  }, [mes, obraId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const diasVisiveis = useMemo(() => {
    const todos = Array.from({ length: diasNoMes }, (_, i) => i + 1);
    const hoje = new Date().getDate();
    if (periodo === 'MENSAL' || periodo === 'ANUAL') return todos;
    if (periodo === 'QUINZENAL') return hoje <= 15 ? todos.filter((d) => d <= 15) : todos.filter((d) => d >= 16);
    return todos.filter((d) => d >= Math.max(1, hoje - 6) && d <= Math.min(diasNoMes, hoje + 3));
  }, [diasNoMes, periodo]);

  const linhasFiltradas = useMemo(() => {
    const selSet = new Set(nomesSelecionados);
    return linhas
      .filter((l) => selSet.has(l.nome))
      .map((l) => {
        if (periodo === 'MENSAL' || periodo === 'ANUAL') return l;
        let td = 0;
        let tv = 0;
        let tp = 0;
        let tval = 0;
        const df: Record<number, CelulaDia> = {};
        for (const d of diasVisiveis) {
          const c = l.dias[d];
          if (!c) continue;
          df[d] = c;
          if (c.tipo !== 'VALE_ONLY') {
            td += Number(c.fracao || 0);
            tv += Number(c.valor || 0);
            if (c.pago) tp += Number(c.valor || 0);
          }
          tval += Number(c.valeDia || 0);
        }
        return {
          ...l,
          dias: df,
          totalDias: Number(td.toFixed(2)),
          totalValor: Number(tv.toFixed(2)),
          totalPago: Number(tp.toFixed(2)),
          totalVales: Number(tval.toFixed(2)),
          saldoAPagar: Number(Math.max(0, tv - tp - tval).toFixed(2)),
        };
      });
  }, [linhas, nomesSelecionados, periodo, diasVisiveis]);

  function toggleNome(nome: string) {
    setNomesSelecionados((prev) =>
      prev.includes(nome) ? prev.filter((n) => n !== nome) : [...prev, nome]
    );
  }

  async function executar(acao: 'BAIXAR' | 'ENVIAR_ZAP') {
    if (linhasFiltradas.length === 0) return;
    setProcessando(true);
    setAviso(null);
    try {
      const dest = destinatarios.find((d) => d.id === destId);
      const telFinal = telefoneCustom.trim() || dest?.telefone || '';
      const obraLabel =
        obraId === 'TODAS'
          ? 'Todas as Obras'
          : obras.find((o) => o.id === obraId)?.nome || 'Obra';

      const res = await fetch('/api/relatorios/personalizado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          telefone: telFinal,
          nomeDestinatario: dest?.nome,
          mes,
          periodoLabel: periodo,
          obraLabel,
          modoConteudo,
          diasVisiveis,
          linhas: linhasFiltradas,
        }),
      });
      const d = (await res.json()) as {
        pdfBase64?: string;
        fileName?: string;
        message?: string;
        enviadoViaWhatsApp?: boolean;
        error?: string;
      };
      if (d.error) {
        setAviso(d.error);
        return;
      }
      if (d.message) setAviso(d.message);
      if ((acao === 'BAIXAR' || !d.enviadoViaWhatsApp) && d.pdfBase64 && d.fileName) {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${d.pdfBase64}`;
        a.download = d.fileName;
        a.click();
      }
    } finally {
      setProcessando(false);
    }
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 bg-slate-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
            Relatório Sob Medida • PDF &amp; Zap
          </span>
          <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2 mt-1">
            <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
            <span>Construtor de Relatório Personalizado</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Escolha obra, colaboradores, período e o que exibir (Presença, Diárias, Vales ou Completo) e envie em PDF para Patrícia, Daniel ou Joabson.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
          />
          <select
            value={obraId}
            onChange={(e) => setObraId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
          >
            <option value="TODAS">Todas as Obras</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
          <div className="inline-flex p-0.5 rounded-xl bg-slate-800 border border-slate-700">
            {(['SEMANAL', 'QUINZENAL', 'MENSAL', 'ANUAL'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-black ${
                  periodo === p ? 'bg-indigo-500 text-white' : 'text-slate-300'
                }`}
              >
                {p === 'SEMANAL'
                  ? 'Semanal'
                  : p === 'QUINZENAL'
                    ? 'Quinzenal'
                    : p === 'MENSAL'
                      ? 'Mensal'
                      : 'Anual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {aviso && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
            {aviso}
          </div>
        )}

        {/* 1. O que exibir */}
        <div className="space-y-2">
          <p className="text-xs font-black uppercase text-slate-500">1. O que incluir no PDF:</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { k: 'PRESENCA', label: 'Somente Presença (sem R$)' },
                { k: 'DIARIAS', label: 'Somente Diárias (sem vales)' },
                { k: 'VALES', label: 'Somente Vales (sem diárias)' },
                { k: 'COMPLETO', label: 'Completo (Diárias + Vales + Líquido)' },
              ] as const
            ).map((m) => (
              <button
                key={m.k}
                type="button"
                onClick={() => setModoConteudo(m.k)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${
                  modoConteudo === m.k
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Colaboradores */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase text-slate-500">
              2. Colaboradores ({nomesSelecionados.length}/{linhas.length}):
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNomesSelecionados(linhas.map((l) => l.nome))}
                className="text-[11px] font-bold text-indigo-700 hover:underline"
              >
                Marcar todos
              </button>
              <button
                type="button"
                onClick={() => setNomesSelecionados([])}
                className="text-[11px] font-bold text-slate-500 hover:underline"
              >
                Limpar
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {linhas.map((l) => {
              const ativo = nomesSelecionados.includes(l.nome);
              return (
                <button
                  key={l.nome}
                  type="button"
                  onClick={() => toggleNome(l.nome)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
                    ativo
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  {ativo ? (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span>{l.nome}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Destinatário + Ações */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-600">Enviar para:</span>
            {destinatarios.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDestId(d.id);
                  setTelefoneCustom('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                  destId === d.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {d.nome}
              </button>
            ))}
            {destId === 'joabson' && (
              <input
                type="text"
                placeholder="WhatsApp Joabson (ex: 5511...)"
                value={telefoneCustom}
                onChange={(e) => setTelefoneCustom(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold w-48"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={processando || linhasFiltradas.length === 0}
              onClick={() => void executar('BAIXAR')}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black flex items-center gap-1.5 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>Baixar PDF</span>
            </button>
            <button
              type="button"
              disabled={processando || linhasFiltradas.length === 0}
              onClick={() => void executar('ENVIAR_ZAP')}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              <span>{processando ? 'Gerando...' : 'Enviar PDF no Zap'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
