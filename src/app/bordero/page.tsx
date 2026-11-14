'use client';

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  CheckSquare,
  Square,
  Copy,
  Check,
  CheckCircle2,
  DollarSign,
  QrCode,
  Calendar,
  Building,
} from 'lucide-react';
import { gerarPayloadPix } from '@/lib/pix';

interface LinhaLancamento {
  id: string;
  data: string;
  descricao: string;
  tipo: 'PONTO' | 'VALE';
  fracao: number;
  valor: number;
  selecionado: boolean;
}

interface ExtratoFuncionario {
  id: string;
  nome: string;
  obra: string;
  chavePix: string;
  diariaPadrao: number;
  lancamentos: LinhaLancamento[];
}

export default function BorderoPage() {
  const [funcionarios, setFuncionarios] = useState<ExtratoFuncionario[]>([
    {
      id: 'func-1',
      nome: 'José Silva',
      obra: 'Obra Bahia (Piscina)',
      chavePix: 'jose.silva.pix@banco.com.br',
      diariaPadrao: 150,
      lancamentos: [
        { id: 'l1', data: '10/11 (Seg)', descricao: 'Diária Integral', tipo: 'PONTO', fracao: 1.0, valor: 150, selecionado: true },
        { id: 'l2', data: '11/11 (Ter)', descricao: 'Diária Integral', tipo: 'PONTO', fracao: 1.0, valor: 150, selecionado: true },
        { id: 'l3', data: '12/11 (Qua)', descricao: 'Diária Integral (Motorista)', tipo: 'PONTO', fracao: 1.0, valor: 180, selecionado: true },
        { id: 'l4', data: '13/11 (Qui)', descricao: 'Meio Dia (Chuva)', tipo: 'PONTO', fracao: 0.5, valor: 75, selecionado: true },
        { id: 'l5', data: '11/11 (Ter)', descricao: 'Adiantamento / Vale', tipo: 'VALE', fracao: 0, valor: 100, selecionado: true },
      ],
    },
    {
      id: 'func-2',
      nome: 'Pedro Souza',
      obra: 'Jabaquara (Obra Civil)',
      chavePix: '11987654321',
      diariaPadrao: 180,
      lancamentos: [
        { id: 'l6', data: '10/11 (Seg)', descricao: 'Diária Integral', tipo: 'PONTO', fracao: 1.0, valor: 180, selecionado: true },
        { id: 'l7', data: '11/11 (Ter)', descricao: 'Diária Integral', tipo: 'PONTO', fracao: 1.0, valor: 180, selecionado: true },
        { id: 'l8', data: '12/11 (Qua)', descricao: 'Diária Integral', tipo: 'PONTO', fracao: 1.0, valor: 180, selecionado: true },
        { id: 'l9', data: '12/11 (Qua)', descricao: 'Adiantamento / Vale', tipo: 'VALE', fracao: 0, valor: 50, selecionado: true },
      ],
    },
  ]);

  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [liquidando, setLiquidando] = useState(false);
  const [liquidadoSucesso, setLiquidadoSucesso] = useState(false);

  // Alternar checkbox de item individual
  function toggleItem(funcId: string, lancId: string) {
    setFuncionarios((prev) =>
      prev.map((f) => {
        if (f.id !== funcId) return f;
        return {
          ...f,
          lancamentos: f.lancamentos.map((l) =>
            l.id === lancId ? { ...l, selecionado: !l.selecionado } : l
          ),
        };
      })
    );
  }

  // Atualizar Chave PIX editável
  function updatePix(funcId: string, novaChave: string) {
    setFuncionarios((prev) =>
      prev.map((f) => (f.id === funcId ? { ...f, chavePix: novaChave } : f))
    );
  }

  // Cálculos em tempo real
  function calcularTotais(f: ExtratoFuncionario) {
    const pontosMarcados = f.lancamentos.filter((l) => l.tipo === 'PONTO' && l.selecionado);
    const valesMarcados = f.lancamentos.filter((l) => l.tipo === 'VALE' && l.selecionado);

    const totalBruto = pontosMarcados.reduce((acc, curr) => acc + curr.valor, 0);
    const totalVales = valesMarcados.reduce((acc, curr) => acc + curr.valor, 0);
    const totalLiquido = Math.max(0, totalBruto - totalVales);
    const totalDiarias = pontosMarcados.reduce((acc, curr) => acc + curr.fracao, 0);

    return { totalBruto, totalVales, totalLiquido, totalDiarias };
  }

  // Copiar PIX Copia e Cola Dinâmico com descrição
  function handleCopiarPix(f: ExtratoFuncionario) {
    const totais = calcularTotais(f);
    const descritivo = `Pgto: ${totais.totalDiarias}d ${f.obra} - Vales R$${totais.totalVales}`;

    const payload = gerarPayloadPix({
      chavePix: f.chavePix,
      nomeRecebedor: f.nome,
      valor: totais.totalLiquido,
      descricao: descritivo,
    });

    navigator.clipboard.writeText(payload);
    setCopiadoId(f.id);
    setTimeout(() => setCopiadoId(null), 3000);
  }

  // Liquidar e encerrar semana
  async function handleLiquidarSemana() {
    setLiquidando(true);
    const idsParaLiquidar: string[] = [];
    funcionarios.forEach((f) => {
      f.lancamentos.forEach((l) => {
        if (l.selecionado) idsParaLiquidar.push(l.id);
      });
    });

    try {
      await fetch('/api/liquidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lancamentosIds: idsParaLiquidar }),
      });

      setLiquidadoSucesso(true);
      setTimeout(() => {
        setFuncionarios((prev) =>
          prev.map((f) => ({
            ...f,
            lancamentos: f.lancamentos.filter((l) => !l.selecionado),
          }))
        );
        setLiquidadoSucesso(false);
      }, 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setLiquidando(false);
    }
  }

  // Total geral de fechamento
  const totalGeral = funcionarios.reduce((acc, curr) => {
    return acc + calcularTotais(curr).totalLiquido;
  }, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-32">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full w-fit mb-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>Fechamento Semanal (Sexta-feira)</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Borderô Semanal e Liquidação de Diárias
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Selecione as diárias e vales para pagamento parcial. Gere o PIX com descritivo automático e encerre a semana.
          </p>
        </div>
      </div>

      {liquidadoSucesso && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>✅ Semana liquidada! Os lançamentos selecionados foram marcados como LIQUIDADO no Supabase.</span>
        </div>
      )}

      {/* Cards por Funcionário */}
      <div className="space-y-6">
        {funcionarios.map((f) => {
          const totais = calcularTotais(f);
          return (
            <div
              key={f.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-5 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                      {f.obra}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">{f.nome}</h3>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Líquido a Pagar</span>
                    <span className="text-xl font-black text-emerald-400">
                      R$ {totais.totalLiquido.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopiarPix(f)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/40"
                  >
                    {copiadoId === f.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>PIX Copiado!</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Copiar PIX</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* PIX Key Input */}
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3 text-xs">
                <span className="font-semibold text-slate-600">Chave PIX:</span>
                <input
                  type="text"
                  value={f.chavePix}
                  onChange={(e) => updatePix(f.id, e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 w-72"
                  placeholder="CPF, Telefone ou E-mail"
                />
                <span className="text-slate-400 text-[11px]">(editável para conferência)</span>
              </div>

              {/* Tabela de Lançamentos com Checkboxes de Liquidação Parcial */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="p-3 w-10 text-center">Liquidar</th>
                      <th className="p-3">Data</th>
                      <th className="p-3">Descrição</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3 text-right">Fração</th>
                      <th className="p-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {f.lancamentos.map((l) => (
                      <tr
                        key={l.id}
                        onClick={() => toggleItem(f.id, l.id)}
                        className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                          l.selecionado ? 'bg-white' : 'bg-slate-100/50 text-slate-400 line-through'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={l.selecionado}
                            onChange={() => {}}
                            aria-label={`Selecionar lançamento ${l.descricao}`}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-medium text-slate-700">{l.data}</td>
                        <td className="p-3 font-semibold text-slate-900">{l.descricao}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              l.tipo === 'PONTO'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {l.tipo === 'PONTO' ? 'DIÁRIA' : 'VALE'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium text-slate-600">
                          {l.tipo === 'PONTO' ? `${l.fracao}x` : '-'}
                        </td>
                        <td
                          className={`p-3 text-right font-bold ${
                            l.tipo === 'PONTO' ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {l.tipo === 'PONTO' ? `+ R$ ${l.valor.toFixed(2)}` : `- R$ ${l.valor.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Subtotal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <div>
                  Diárias marcadas: <strong>{totais.totalDiarias}</strong> | Vales deduzidos: <strong>R$ {totais.totalVales.toFixed(2)}</strong>
                </div>
                <div className="font-bold text-slate-900">
                  Subtotal: <span className="text-emerald-700">R$ {totais.totalLiquido.toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Bar: Total Geral + Encerrar Semana */}
      <div className="fixed bottom-0 left-64 right-0 bg-white border-t border-slate-200 px-8 py-4 shadow-xl flex items-center justify-between z-20">
        <div>
          <span className="text-xs text-slate-500 font-medium block">Total Geral Selecionado</span>
          <span className="text-2xl font-black text-slate-900">
            R$ {totalGeral.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleLiquidarSemana}
            disabled={liquidando || totalGeral === 0}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{liquidando ? 'Liquidando...' : 'Liquidar e Encerrar Semana'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
