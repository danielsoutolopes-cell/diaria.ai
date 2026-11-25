'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Building2,
  UserCheck,
} from 'lucide-react';

interface AdiantamentoItem {
  id: string;
  funcionario_id: string;
  funcionario_nome: string;
  obra_id: string | null;
  obra_nome: string;
  data_adiantamento: string;
  quantidade_diarias: number;
  quantidade_restante: number;
  valor_unitario: number;
  valor_total: number;
  status: 'ATIVO' | 'QUITADO' | 'CANCELADO';
  observacao: string | null;
}

interface FuncOpcao {
  id: string;
  nome: string;
  valor_diaria: number;
  valor_diaria_obra: number;
  valor_diaria_piscina: number;
}

interface ObraOpcao {
  id: string;
  nome: string;
  tipo_obra: string;
}

export default function AdiantamentoDiariasPanel() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [adiantamentos, setAdiantamentos] = useState<AdiantamentoItem[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncOpcao[]>([]);
  const [obras, setObras] = useState<ObraOpcao[]>([]);

  const [funcionarioId, setFuncionarioId] = useState('');
  const [obraId, setObraId] = useState('');
  const [quantidadeDiarias, setQuantidadeDiarias] = useState('5');
  const [dataAdiantamento, setDataAdiantamento] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [observacao, setObservacao] = useState('');
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/adiantamentos-diarias', { cache: 'no-store' });
      const data = (await res.json()) as {
        adiantamentos?: AdiantamentoItem[];
        funcionarios?: FuncOpcao[];
        obras?: ObraOpcao[];
      };
      setAdiantamentos(data.adiantamentos || []);
      const fns = data.funcionarios || [];
      const obs = data.obras || [];
      setFuncionarios(fns);
      setObras(obs);
      if (fns.length > 0) setFuncionarioId((p) => p || fns[0].id);
      if (obs.length > 0) setObraId((p) => p || obs[0].id);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const valorUnitario = useMemo(() => {
    const f = funcionarios.find((x) => x.id === funcionarioId);
    const o = obras.find((x) => x.id === obraId);
    if (!f) return 0;
    if (o?.tipo_obra === 'PISCINA') {
      return Number(f.valor_diaria_piscina || f.valor_diaria || 0);
    }
    return Number(f.valor_diaria_obra || f.valor_diaria || 0);
  }, [funcionarios, obras, funcionarioId, obraId]);

  const valorTotal = useMemo(() => {
    const qtd = Number(quantidadeDiarias || 0);
    return Number((qtd * valorUnitario).toFixed(2));
  }, [quantidadeDiarias, valorUnitario]);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/adiantamentos-diarias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funcionarioId,
          obraId: obraId || null,
          dataAdiantamento,
          quantidadeDiarias: Number(quantidadeDiarias),
          valorUnitario,
          observacao,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok || !data.success) {
        setFeedback({ tipo: 'erro', texto: data.error || 'Erro ao registrar adiantamento.' });
        return;
      }
      setObservacao('');
      setFeedback({ tipo: 'sucesso', texto: data.message || 'Adiantamento registrado!' });
      await carregar();
    } catch {
      setFeedback({ tipo: 'erro', texto: 'Falha de conexão ao salvar adiantamento.' });
    } finally {
      setSalvando(false);
    }
  }

  async function handleCancelar(id: string) {
    await fetch(`/api/adiantamentos-diarias?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await carregar();
  }

  const ativos = adiantamentos.filter((a) => a.status === 'ATIVO');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div>
          <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 mb-2">
            DESCONTO DE DIÁRIAS • FORA DO CAIXINHA / VALES
          </span>
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-700" />
            <span>Adiantar Diárias Futuras (Abatimento Automático)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Registre diárias pagas antecipadamente. Conforme o colaborador trabalhar nos próximos dias (em qualquer obra), o sistema abate automaticamente do saldo até zerar.
          </p>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
              feedback.tipo === 'sucesso'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
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

        <form onSubmit={handleSalvar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Colaborador *</span>
            </label>
            <select
              disabled={carregando}
              value={funcionarioId}
              onChange={(e) => setFuncionarioId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
            >
              {funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Obra de Referência</span>
            </label>
            <select
              disabled={carregando}
              value={obraId}
              onChange={(e) => setObraId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
            >
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Qtd. Diárias *</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              required
              value={quantidadeDiarias}
              onChange={(e) => setQuantidadeDiarias(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Data do Pagamento *</label>
            <input
              type="date"
              required
              value={dataAdiantamento}
              onChange={(e) => setDataAdiantamento(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3 space-y-1">
            <label className="text-xs font-bold text-slate-700">Observação (opcional)</label>
            <input
              type="text"
              placeholder="Ex.: Adiantamento da próxima semana na obra Quase Tudo..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            />
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="submit"
              disabled={salvando || carregando}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>
                {salvando
                  ? 'Salvando...'
                  : `Adiantar (R$ ${valorTotal.toFixed(2)})`}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Lista de Saldos Ativos e Histórico */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">
            Saldos de Diárias Adiantadas ({ativos.length} ativo(s))
          </h3>
        </div>

        {adiantamentos.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            Nenhum adiantamento de diárias registrado ainda.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
            {adiantamentos.map((a) => (
              <div
                key={a.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">
                      {a.funcionario_nome}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        a.status === 'ATIVO'
                          ? 'bg-indigo-100 text-indigo-800'
                          : a.status === 'QUITADO'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {a.status}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      {a.obra_nome}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 tabular-nums">
                    Restam <strong>{a.quantidade_restante}</strong> de{' '}
                    <strong>{a.quantidade_diarias}</strong> diária(s) • Total:{' '}
                    <strong>R$ {Number(a.valor_total).toFixed(2)}</strong> • Pago em{' '}
                    {a.data_adiantamento}
                  </p>
                  {a.observacao && (
                    <p className="text-[11px] text-slate-400">{a.observacao}</p>
                  )}
                </div>

                {a.status === 'ATIVO' && (
                  <button
                    type="button"
                    onClick={() => void handleCancelar(a.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 self-end sm:self-center"
                    title="Cancelar saldo restante"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
