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

interface MovimentoCaixaCampo {
  id: string;
  encarregado: string;
  obra: string;
  data: string;
  hora: string;
  tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  categoria: string;
  descricao: string;
  valor: number;
  status: 'PENDENTE' | 'APROVADO';
  enviadoPor: string;
}

interface ContaEncarregado {
  encarregado: string;
  totalRecebido: number;
  totalComprovado: number;
  totalDevolvido: number;
  saldoEmMaos: number;
  movimentos: MovimentoCaixaCampo[];
}

export default function CaixaCampoPanel() {
  const [contas, setContas] = useState<ContaEncarregado[]>([]);
  const [funcionarios, setFuncionarios] = useState<string[]>([]);
  const [obras, setObras] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lendoIA, setLendoIA] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Form rápido com Dropdowns
  const [encarregado, setEncarregado] = useState('');
  const [obra, setObra] = useState('');
  const [tipo, setTipo] = useState<'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO'>('NOTA_DESPESA');
  const [categoria, setCategoria] = useState('Material');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');

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
            .map((f) => f.nome_trabalhador?.trim())
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
        tipo,
        categoria,
        descricao,
        valor: Number(valor.replace(',', '.')),
      }),
    });
    setDescricao('');
    setValor('');
    mostrarAviso('Movimento registrado na Conta Corrente de Caixa de Campo.');
    void carregar();
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
    void carregar();
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
    void carregar();
  }

  async function handleAprovar(id: string) {
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'aprovar', id }),
    });
    void carregar();
  }

  async function handleExcluir(id: string) {
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'excluir', id }),
    });
    void carregar();
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

        {/* Form rápido com Dropdowns de Colaborador e Obra */}
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
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição (ex: Aluguel bomba, Material...)"
            className="sm:col-span-3 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
          />

          <input
            type="text"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Valor (R$)"
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black"
          />

          <button
            type="submit"
            className="sm:col-span-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center"
            title="Lançar movimento"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        {/* Contas por Encarregado / Colaborador */}
        {loading ? (
          <p className="text-xs text-slate-500 text-center py-4">
            Carregando contas de campo...
          </p>
        ) : contas.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            Nenhum movimento de Caixa de Campo registrado ainda.
          </p>
        ) : (
          contas.map((c) => (
            <div
              key={c.encarregado}
              className="rounded-2xl border border-slate-200 overflow-hidden"
            >
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-black text-slate-950">
                    {c.encarregado}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    Recebido: R$ {c.totalRecebido.toFixed(2)}
                  </span>
                  <span className="font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                    Notas: R$ {c.totalComprovado.toFixed(2)}
                  </span>
                  <span
                    className={`font-black px-3 py-1 rounded-lg border ${
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
                        <span className="font-bold text-slate-900">
                          {m.descricao}
                        </span>
                        <span className="text-slate-400 block text-[11px]">
                          {m.obra} • {m.data} às {m.hora} • {m.categoria}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-black text-sm ${
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
