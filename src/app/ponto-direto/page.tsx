'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  ClipboardCheck,
  Edit3,
  Trash2,
  UserCheck,
  Building2,
  Calendar,
} from 'lucide-react';

interface ObraOpcao {
  id: string;
  nome: string;
  tipoObra: string;
  valorDiariaPadrao: number;
}

interface FuncionarioOpcao {
  id: string;
  nome: string;
  valorDiaria: number;
  valorDiariaObra: number;
  valorDiariaPiscina: number;
}

export default function PontoDiretoPage() {
  const [carregando, setCarregando] = useState(true);
  const [obras, setObras] = useState<ObraOpcao[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpcao[]>([]);

  // Passo 1: Formulário
  const [obraId, setObraId] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [dataReferencia, setDataReferencia] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [fracaoDia, setFracaoDia] = useState<number>(1.0);
  const [motivo, setMotivo] = useState<'NORMAL' | 'MEIO_DIA' | 'CHUVA' | 'VIAGEM' | 'DIA_PARADO'>('NORMAL');
  const [valorCustom, setValorCustom] = useState<string>('');
  const [observacao, setObservacao] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // Passo 2: Modal de Dupla Confirmação com edição inline
  const [modalConfirmacao, setModalConfirmacao] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/ponto-direto', { cache: 'no-store' });
      const data = (await res.json()) as {
        obras?: ObraOpcao[];
        funcionarios?: FuncionarioOpcao[];
      };
      const obs = data.obras || [];
      const fns = data.funcionarios || [];
      setObras(obs);
      setFuncionarios(fns);
      if (obs.length > 0) setObraId((prev) => prev || obs[0].id);
      if (fns.length > 0) setFuncionarioId((prev) => prev || fns[0].id);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const obraSelecionada = useMemo(
    () => obras.find((o) => o.id === obraId) || null,
    [obras, obraId]
  );
  const funcSelecionado = useMemo(
    () => funcionarios.find((f) => f.id === funcionarioId) || null,
    [funcionarios, funcionarioId]
  );

  const valorCalculado = useMemo(() => {
    if (valorCustom.trim() !== '' && !Number.isNaN(Number(valorCustom))) {
      return Number(valorCustom);
    }
    if (motivo === 'CHUVA' || motivo === 'VIAGEM') {
      return Number((150 * fracaoDia).toFixed(2));
    }
    if (motivo === 'DIA_PARADO') {
      return Number((120 * fracaoDia).toFixed(2));
    }
    if (!funcSelecionado || !obraSelecionada) return 0;
    const base =
      obraSelecionada.tipoObra === 'PISCINA'
        ? funcSelecionado.valorDiariaPiscina
        : funcSelecionado.valorDiariaObra;
    return Number((base * fracaoDia).toFixed(2));
  }, [valorCustom, motivo, fracaoDia, funcSelecionado, obraSelecionada]);

  function handleSelecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setFotoFile(file);
    if (file) {
      setFotoPreview(URL.createObjectURL(file));
    } else {
      setFotoPreview(null);
    }
  }

  function abrirDuplaConfirmacao(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!obraSelecionada || !funcSelecionado || !dataReferencia) {
      setFeedback({
        tipo: 'erro',
        texto: 'Preencha Obra, Colaborador e Data antes de continuar.',
      });
      return;
    }
    setModalConfirmacao(true);
  }

  async function confirmarGravacaoFinal() {
    if (!obraSelecionada || !funcSelecionado) return;
    setGravando(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('obraId', obraSelecionada.id);
      fd.append('obraNome', obraSelecionada.nome);
      fd.append('funcionarioId', funcSelecionado.id);
      fd.append('nomeTrabalhador', funcSelecionado.nome);
      fd.append('dataReferencia', dataReferencia);
      fd.append('fracaoDia', String(fracaoDia));
      fd.append('valorMonetario', String(valorCalculado));
      fd.append(
        'observacao',
        observacao.trim() ? `${motivo} — ${observacao.trim()}` : motivo
      );
      fd.append('indicadoPor', 'DANIEL');
      if (fotoFile) fd.append('foto', fotoFile);

      const res = await fetch('/api/ponto-direto', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao gravar ponto direto.',
        });
        return;
      }

      setModalConfirmacao(false);
      setObservacao('');
      setValorCustom('');
      setFotoFile(null);
      setFotoPreview(null);
      setFeedback({
        tipo: 'sucesso',
        texto: data.message || 'Ponto gravado com sucesso!',
      });
    } catch {
      setFeedback({ tipo: 'erro', texto: 'Erro de conexão ao gravar ponto.' });
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 mb-2">
          ABA_PONTO_DIRETO • INDICAÇÃO DIRETA (SEM ENCARREGADO)
        </span>
        <h1 className="text-2xl font-black text-slate-950 flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-emerald-700" />
          <span>Lançar Ponto Direto (Com Foto &amp; Dupla Confirmação)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Passo 1: preencha os dados e anexe foto opcional. Passo 2: revise o
          resumo rápido (com edição de qualquer campo) e confirme a gravação.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
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

      {/* PASSO 1: FORMULÁRIO */}
      <form
        onSubmit={abrirDuplaConfirmacao}
        className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Obra *</span>
            </label>
            <select
              disabled={carregando}
              value={obraId}
              onChange={(e) => setObraId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
            >
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome} ({o.tipoObra === 'PISCINA' ? 'Piscina' : 'Obra Civil'})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Colaborador *</span>
            </label>
            <select
              disabled={carregando}
              value={funcionarioId}
              onChange={(e) => {
                setFuncionarioId(e.target.value);
                setValorCustom('');
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
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
              <Calendar className="w-3.5 h-3.5 text-emerald-700" />
              <span>Data *</span>
            </label>
            <input
              type="date"
              required
              value={dataReferencia}
              onChange={(e) => setDataReferencia(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Tipo &amp; Fração *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { m: 'NORMAL', f: 1.0, label: '1.0 Normal' },
                  { m: 'MEIO_DIA', f: 0.5, label: '0.5 Meio Dia' },
                  { m: 'CHUVA', f: 1.0, label: 'Chuva' },
                  { m: 'VIAGEM', f: 1.0, label: 'Viagem' },
                  { m: 'DIA_PARADO', f: 1.0, label: 'Parado' },
                ] as const
              ).map((op) => (
                <button
                  key={op.m}
                  type="button"
                  onClick={() => {
                    setMotivo(op.m);
                    setFracaoDia(op.f);
                    setValorCustom('');
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                    motivo === op.m
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700">
            Observação (opcional)
          </label>
          <input
            type="text"
            placeholder="Ex.: Apontamento direto confirmado..."
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
          />
        </div>

        {/* Foto opcional com preview */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700">
            Foto / Comprovante (opcional)
          </label>
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 cursor-pointer text-xs font-bold text-emerald-900">
              <Camera className="w-4 h-4 text-emerald-700" />
              <span>{fotoFile ? fotoFile.name : 'Anexar ou tirar foto'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSelecionarFoto}
              />
            </label>
            {fotoPreview && (
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                <img
                  src={fotoPreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFotoFile(null);
                    setFotoPreview(null);
                  }}
                  className="absolute top-0.5 right-0.5 p-1 rounded bg-slate-900/75 text-white"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={carregando}
          className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black shadow-md transition-all"
        >
          OK / Continuar para Resumo →
        </button>
      </form>

      {/* PASSO 2: MODAL DE DUPLA CONFIRMAÇÃO (COM EDIÇÃO INLINE) */}
      {modalConfirmacao && obraSelecionada && funcSelecionado && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-950 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-emerald-700" />
                  <span>Dupla Confirmação — Revisar &amp; Gravar</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Confira ou ajuste qualquer campo abaixo antes da gravação
                  definitiva.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalConfirmacao(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Voltar
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500">
                    Colaborador
                  </label>
                  <select
                    value={funcionarioId}
                    onChange={(e) => setFuncionarioId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  >
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500">
                    Obra
                  </label>
                  <select
                    value={obraId}
                    onChange={(e) => setObraId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  >
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500">
                    Data
                  </label>
                  <input
                    type="date"
                    value={dataReferencia}
                    onChange={(e) => setDataReferencia(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500">
                    Fração do Dia
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="1"
                    value={fracaoDia}
                    onChange={(e) => setFracaoDia(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500">
                  Observação
                </label>
                <input
                  type="text"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              {fotoPreview && (
                <img
                  src={fotoPreview}
                  alt="Foto anexada"
                  className="max-h-36 rounded-2xl border border-slate-200 object-contain"
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalConfirmacao(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={gravando}
                onClick={() => void confirmarGravacaoFinal()}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-md disabled:opacity-50"
              >
                {gravando ? 'Gravando...' : 'Confirmar Gravação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
