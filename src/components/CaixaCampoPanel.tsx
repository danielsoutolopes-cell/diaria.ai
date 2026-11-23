'use client';

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Trash2,
  Plus,
  Sparkles,
  Camera,
  ArrowRightCircle,
} from 'lucide-react';

import { formatarNomeExibicaoTrabalhador } from '@/lib/normalizarObra';

interface MovimentoCaixaCampo {
  id: string;
  encarregado: string;
  encarregadoOrigem?: string;
  obra: string;
  data: string;
  hora: string;
  tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  categoria: string;
  descricao: string;
  valor: number;
  status: 'PENDENTE' | 'APROVADO';
  isPreImplantacao?: boolean;
  enviadoPor: string;
}

interface ContaEncarregado {
  encarregado: string;
  aliasesUnificados?: string[];
  possuiPreImplantacao?: boolean;
  totalRecebido: number;
  totalComprovado: number;
  totalDevolvido: number;
  saldoEmMaos: number;
  movimentos: MovimentoCaixaCampo[];
}

interface CaixaCampoPanelProps {
  onDadosAtualizados?: () => void;
}

export default function CaixaCampoPanel({
  onDadosAtualizados,
}: CaixaCampoPanelProps) {
  const [contas, setContas] = useState<ContaEncarregado[]>([]);
  const [funcionarios, setFuncionarios] = useState<string[]>([]);
  const [obras, setObras] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lendoIA, setLendoIA] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Form rápido com Dropdowns + Data
  const [encarregado, setEncarregado] = useState('');
  const [obra, setObra] = useState('');
  const [dataMov, setDataMov] = useState(() =>
    new Date().toISOString().split('T')[0]
  );
  const [tipo, setTipo] = useState<'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO'>('NOTA_DESPESA');
  const [categoria, setCategoria] = useState('Material');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [filtroConta, setFiltroConta] = useState<string>('TODOS');

  async function carregar() {
    setLoading(true);
    try {
      const [resCaixa, resFuncs, resObras] = await Promise.all([
        fetch('/api/caixa-campo', { cache: 'no-store' }),
        fetch('/api/funcionarios', { cache: 'no-store' }),
        fetch('/api/obras', { cache: 'no-store' }),
      ]);
      const dCaixa = (await resCaixa.json()) as { contas?: ContaEncarregado[] };
      const dFuncs = (await resFuncs.json()) as {
        funcionarios?: Array<{ nome_trabalhador: string }>;
      };
      const dObras = (await resObras.json()) as {
        obras?: Array<{ nome: string }>;
      };

      setContas(dCaixa.contas || []);

      const listaFuncs = Array.from(
        new Set(
          (dFuncs.funcionarios || [])
            .map((f) =>
              f.nome_trabalhador?.trim()
                ? formatarNomeExibicaoTrabalhador(f.nome_trabalhador)
                : ''
            )
            .filter(Boolean)
        )
      );
      setFuncionarios(listaFuncs);
      if (!encarregado && listaFuncs.length > 0) setEncarregado(listaFuncs[0]);

      const listaObras = Array.from(
        new Set(
          (dObras.obras || []).map((o) => o.nome?.trim()).filter(Boolean)
        )
      );
      setObras(listaObras);
      if (!obra && listaObras.length > 0) setObra(listaObras[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function mostrarAviso(msg: string) {
    setAviso(msg);
    setTimeout(() => setAviso(null), 4500);
  }

  async function handleLerFotoIA(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLendoIA(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (typeof reader.result !== 'string') return;
        const res = await fetch('/api/caixa-campo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ler-nota-ia',
            imagemBase64: reader.result,
            imagemMimeType: file.type || 'image/jpeg',
          }),
        });
        const d = (await res.json()) as {
          leitura?: {
            tipo?: 'ENTRADA_PIX' | 'NOTA_DESPESA';
            valor?: number;
            categoria?: string;
            descricao?: string;
          };
        };
        if (d.leitura) {
          if (d.leitura.tipo) setTipo(d.leitura.tipo);
          if (d.leitura.valor) setValor(String(d.leitura.valor));
          if (d.leitura.categoria) setCategoria(d.leitura.categoria);
          if (d.leitura.descricao) setDescricao(d.leitura.descricao);
          mostrarAviso('Leitura automática concluída! Confira e clique em + para lançar.');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLendoIA(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (!encarregado || !descricao.trim() || !valor) return;
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'registrar',
        encarregado,
        obra: obra || 'GERAL',
        data: dataMov,
        tipo,
        categoria,
        descricao,
        valor: Number(valor.replace(',', '.')),
      }),
    });
    setDescricao('');
    setValor('');
    mostrarAviso('Movimento registrado na Conta Corrente de Caixa de Campo.');
    await carregar();
    onDadosAtualizados?.();
  }

  async function handleLiquidarDireto(c: ContaEncarregado) {
    if (c.saldoEmMaos === 0) return;
    const isTroco = c.saldoEmMaos > 0;
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'registrar',
        encarregado: c.encarregado,
        obra: c.movimentos[0]?.obra || obra || 'GERAL',
        tipo: isTroco ? 'DEVOLUCAO_TROCO' : 'ENTRADA_PIX',
        categoria: isTroco ? 'Devolução de Troco' : 'Pagamento de Reembolso',
        descricao: isTroco
          ? `Devolução de troco via PIX (${c.encarregado})`
          : `Quitação de reembolso via PIX avulso (${c.encarregado})`,
        valor: Math.abs(c.saldoEmMaos),
      }),
    });
    mostrarAviso(
      isTroco
        ? `Devolução de troco de R$ ${Math.abs(c.saldoEmMaos).toFixed(2)} registrada!`
        : `Reembolso de R$ ${Math.abs(c.saldoEmMaos).toFixed(2)} quitado via PIX!`
    );
    await carregar();
    onDadosAtualizados?.();
  }

  async function handleLevarParaFechamento(c: ContaEncarregado) {
    if (c.saldoEmMaos === 0) return;
    const res = await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'levar-fechamento',
        encarregado: c.encarregado,
        obra: c.movimentos[0]?.obra || obra || 'GERAL',
        valor: c.saldoEmMaos,
      }),
    });
    const d = (await res.json()) as { message?: string };
    if (d.message) mostrarAviso(d.message);
    await carregar();
    onDadosAtualizados?.();
  }

  function handleCopiarExtratoZap(c: ContaEncarregado) {
    const linhas = c.movimentos
      .map(
        (m) =>
          `${m.tipo === 'ENTRADA_PIX' ? '🟢 +' : '🔴 −'}R$ ${Number(m.valor).toFixed(2)} | ${m.data} (${m.hora}) — ${m.descricao}`
      )
      .join('\n');
    const resumoSaldo =
      c.saldoEmMaos > 0
        ? `Troco em mãos: R$ ${c.saldoEmMaos.toFixed(2)}`
        : c.saldoEmMaos < 0
          ? `Reembolso a receber: R$ ${Math.abs(c.saldoEmMaos).toFixed(2)}`
          : 'Saldo zerado ✓';
    const texto =
      `📋 *EXTRATO CAIXA DE CAMPO — ${c.encarregado.toUpperCase()}*\n` +
      `Recebido: R$ ${c.totalRecebido.toFixed(2)} | Notas: R$ ${c.totalComprovado.toFixed(2)}\n` +
      `⚖️ *${resumoSaldo}*\n\n${linhas}`;
    void navigator.clipboard.writeText(texto);
    mostrarAviso(`Extrato de ${c.encarregado} copiado para o WhatsApp!`);
  }

  async function handleAprovar(id: string) {
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'aprovar', id }),
    });
    await carregar();
    onDadosAtualizados?.();
  }

  async function handleExcluir(id: string) {
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'excluir', id }),
    });
    await carregar();
    onDadosAtualizados?.();
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-4 bg-gradient-to-r from-slate-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Wallet className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-sm font-black tracking-tight">
              Conta Corrente de Caixa de Campo & Reembolsos
            </h2>
            <p className="text-[11px] text-slate-400">
              Saldo positivo = troco em mãos • Saldo negativo = reembolso a pagar • Liquidação 100% humana
            </p>
          </div>
        </div>

        <label className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all">
          <Camera className="w-3.5 h-3.5" />
          <span>{lendoIA ? 'Lendo nota com IA...' : 'Ler Nota / PIX com IA'}</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleLerFotoIA}
            className="hidden"
          />
        </label>
      </div>

      <div className="p-6 space-y-6">
        {aviso && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
            {aviso}
          </div>
        )}

        {/* Seção 1: Novo Lançamento */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center">
              1
            </span>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Novo Lançamento (PIX Enviado ou Nota Fiscal)
            </h3>
          </div>
          <form
            onSubmit={handleRegistrar}
            className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-2.5"
          >
          <select
            value={encarregado}
            onChange={(e) => setEncarregado(e.target.value)}
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
          >
            <option value="">Colaborador...</option>
            {funcionarios.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            value={obra}
            onChange={(e) => setObra(e.target.value)}
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
          >
            <option value="">Obra...</option>
            {obras.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          <select
            value={tipo}
            onChange={(e) =>
              setTipo(
                e.target.value as 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO'
              )
            }
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold"
          >
            <option value="ENTRADA_PIX">🟢 Entrada PIX</option>
            <option value="NOTA_DESPESA">🔴 Nota / Despesa</option>
            <option value="DEVOLUCAO_TROCO">🔵 Devolução Troco</option>
          </select>

          <input
            type="date"
            value={dataMov}
            onChange={(e) => setDataMov(e.target.value)}
            className="sm:col-span-2 px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
            title="Data do lançamento (aceita datas retroativas)"
          />

          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição (ex: Aluguel bomba, Material...)"
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
          />

          <input
            type="text"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Valor (R$)"
            className="sm:col-span-1 px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black"
          />

          <button
            type="submit"
            className="sm:col-span-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center"
            title="Lançar movimento"
          >
            <Plus className="w-4 h-4" />
          </button>
          </form>
        </div>

        {/* Seção 2: Extrato por Colaborador (Saldos & Liquidação) */}
        {contas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center">
                2
              </span>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Extrato por Colaborador • Saldos & Liquidação ({contas.length})
              </h3>
            </div>
            <select
              value={filtroConta}
              onChange={(e) => setFiltroConta(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
            >
              <option value="TODOS">
                Todos com lançamentos ({contas.length})
              </option>
              {contas.map((c) => (
                <option key={c.encarregado} value={c.encarregado}>
                  {c.encarregado} —{' '}
                  {c.saldoEmMaos > 0
                    ? `Troco R$ ${c.saldoEmMaos.toFixed(2)}`
                    : c.saldoEmMaos < 0
                      ? `Reembolso R$ ${Math.abs(c.saldoEmMaos).toFixed(2)}`
                      : 'Zerado'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Contas por Encarregado / Colaborador */}
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
          </div>
        ) : contas.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            Nenhum movimento de Caixa de Campo registrado ainda.
          </p>
        ) : (
          contas
            .filter(
              (c) => filtroConta === 'TODOS' || c.encarregado === filtroConta
            )
            .map((c) => (
            <div
              key={c.encarregado}
              className="rounded-2xl border border-slate-200 overflow-hidden"
            >
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-black text-slate-950">
                    {formatarNomeExibicaoTrabalhador(c.encarregado)}
                  </span>
                  {c.possuiPreImplantacao && (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      Pré-implantação preservada
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 tabular-nums">
                    Recebido: R$ {c.totalRecebido.toFixed(2)}
                  </span>
                  <span className="font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 tabular-nums">
                    Notas: R$ {c.totalComprovado.toFixed(2)}
                  </span>
                  <span
                    className={`font-black px-3 py-1 rounded-lg border tabular-nums ${
                      c.saldoEmMaos > 0
                        ? 'text-amber-900 bg-amber-100 border-amber-300'
                        : c.saldoEmMaos < 0
                          ? 'text-indigo-900 bg-indigo-100 border-indigo-300'
                          : 'text-emerald-900 bg-emerald-100 border-emerald-300'
                    }`}
                  >
                    {c.saldoEmMaos > 0
                      ? `Troco em Mãos: R$ ${c.saldoEmMaos.toFixed(2)}`
                      : c.saldoEmMaos < 0
                        ? `Reembolso a Pagar: R$ ${Math.abs(c.saldoEmMaos).toFixed(2)}`
                        : 'Saldo Zerado ✓'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleCopiarExtratoZap(c)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold"
                    title="Copiar extrato formatado para enviar no WhatsApp"
                  >
                    📋 Copiar Zap
                  </button>

                  {c.saldoEmMaos !== 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleLiquidarDireto(c)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold"
                      >
                        {c.saldoEmMaos > 0
                          ? '🔵 Devolver Troco'
                          : '🟢 Pagar Reembolso'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLevarParaFechamento(c)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1"
                        title="Levar este saldo opcionalmente para Fechamento & Pagamentos (PIX)"
                      >
                        <ArrowRightCircle className="w-3.5 h-3.5" />
                        <span>Levar p/ Fechamento</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {c.movimentos.map((m) => (
                  <div
                    key={m.id}
                    className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {m.tipo === 'ENTRADA_PIX' ? (
                        <ArrowDownCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <ArrowUpCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900">
                            {m.descricao}
                          </span>
                          {m.isPreImplantacao && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              Pré-implantação
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 block text-[11px]">
                          {m.obra} • {m.data} às {m.hora} • {m.categoria}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-black text-sm tabular-nums ${
                          m.tipo === 'ENTRADA_PIX'
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {m.tipo === 'ENTRADA_PIX' ? '+' : '−'} R${' '}
                        {Number(m.valor).toFixed(2)}
                      </span>

                      {m.status === 'PENDENTE' ? (
                        <button
                          type="button"
                          onClick={() => handleAprovar(m.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold"
                        >
                          Conferir
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          OK
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleExcluir(m.id)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
