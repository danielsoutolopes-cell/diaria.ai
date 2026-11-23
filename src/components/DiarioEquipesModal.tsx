'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  HardHat,
  UserPlus,
  Pencil,
  Check,
  Search,
} from 'lucide-react';
import {
  ETAPAS_PADRAO_OBRA,
  normalizarTextoBusca,
  type EmpreiteiroDiarioRecord,
  type FuncionarioEmpreiteiroRecord,
} from '@/lib/diarioObraRelatorio';

interface DiarioEquipesModalProps {
  aberto: boolean;
  abaInicial?: 'empreiteiros' | 'funcionarios';
  empreiteiroInicialId?: string;
  empreiteiros: EmpreiteiroDiarioRecord[];
  funcionarios: FuncionarioEmpreiteiroRecord[];
  onClose: () => void;
  onAtualizado: (payload: {
    empreiteiros: EmpreiteiroDiarioRecord[];
    funcionarios: FuncionarioEmpreiteiroRecord[];
    novoEmpreiteiroId?: string;
    novoFuncionarioId?: string;
  }) => void;
}

export default function DiarioEquipesModal({
  aberto,
  abaInicial = 'empreiteiros',
  empreiteiroInicialId = '',
  empreiteiros,
  funcionarios,
  onClose,
  onAtualizado,
}: DiarioEquipesModalProps) {
  const [aba, setAba] = useState<'empreiteiros' | 'funcionarios'>(abaInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  // Form Empreiteiro
  const [editEmpId, setEditEmpId] = useState<string | null>(null);
  const [empNome, setEmpNome] = useState('');
  const [empApelidos, setEmpApelidos] = useState('');
  const [empDocumento, setEmpDocumento] = useState('');
  const [empEtapaPadrao, setEmpEtapaPadrao] = useState('');

  // Form Funcionário
  const [editFuncId, setEditFuncId] = useState<string | null>(null);
  const [funcEmpreiteiroId, setFuncEmpreiteiroId] = useState(empreiteiroInicialId);
  const [funcNomeOficial, setFuncNomeOficial] = useState('');
  const [funcApelidos, setFuncApelidos] = useState('');
  const [funcDocumento, setFuncDocumento] = useState('');

  useEffect(() => {
    if (aberto) {
      setAba(abaInicial);
      setFuncEmpreiteiroId(empreiteiroInicialId || '');
      setErro(null);
      setBusca('');
    }
  }, [aberto, abaInicial, empreiteiroInicialId]);

  if (!aberto) return null;

  function limparFormEmpreiteiro() {
    setEditEmpId(null);
    setEmpNome('');
    setEmpApelidos('');
    setEmpDocumento('');
    setEmpEtapaPadrao('');
  }

  function limparFormFuncionario() {
    setEditFuncId(null);
    setFuncNomeOficial('');
    setFuncApelidos('');
    setFuncDocumento('');
  }

  async function handleSalvarEmpreiteiro(e: React.FormEvent) {
    e.preventDefault();
    if (!empNome.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch('/api/diario-obra/equipes', {
        method: editEmpId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'empreiteiro',
          id: editEmpId || undefined,
          nome: empNome.trim(),
          apelidos: empApelidos,
          documento: empDocumento.trim() || null,
          etapaPadrao: empEtapaPadrao.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        empreiteiro?: EmpreiteiroDiarioRecord;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      if (!res.ok || !data.success) {
        setErro(data.error || 'Falha ao salvar empreiteiro.');
        return;
      }
      onAtualizado({
        empreiteiros: data.empreiteiros || empreiteiros,
        funcionarios: data.funcionarios || funcionarios,
        novoEmpreiteiroId: data.empreiteiro?.id,
      });
      limparFormEmpreiteiro();
    } catch {
      setErro('Erro de comunicação ao salvar empreiteiro.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleSalvarFuncionario(e: React.FormEvent) {
    e.preventDefault();
    if (!funcNomeOficial.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch('/api/diario-obra/equipes', {
        method: editFuncId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'funcionario',
          id: editFuncId || undefined,
          empreiteiroId: funcEmpreiteiroId || null,
          nomeOficial: funcNomeOficial.trim(),
          apelidos: funcApelidos,
          documento: funcDocumento.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        funcionario?: FuncionarioEmpreiteiroRecord;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      if (!res.ok || !data.success) {
        setErro(data.error || 'Falha ao salvar funcionário.');
        return;
      }
      onAtualizado({
        empreiteiros: data.empreiteiros || empreiteiros,
        funcionarios: data.funcionarios || funcionarios,
        novoFuncionarioId: data.funcionario?.id,
      });
      limparFormFuncionario();
    } catch {
      setErro('Erro de comunicação ao salvar funcionário.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemover(tipo: 'empreiteiro' | 'funcionario', id: string) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(
        `/api/diario-obra/equipes?tipo=${tipo}&id=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      if (!res.ok || !data.success) {
        setErro(data.error || 'Falha ao remover cadastro.');
        return;
      }
      onAtualizado({
        empreiteiros: data.empreiteiros || empreiteiros,
        funcionarios: data.funcionarios || funcionarios,
      });
    } catch {
      setErro('Erro ao remover registro.');
    } finally {
      setSalvando(false);
    }
  }

  const termoNorm = normalizarTextoBusca(busca);
  const empreiteirosFiltrados = empreiteiros.filter((emp) => {
    if (!termoNorm) return true;
    return (
      normalizarTextoBusca(emp.nome).includes(termoNorm) ||
      emp.apelidos.some((a) => normalizarTextoBusca(a).includes(termoNorm)) ||
      normalizarTextoBusca(emp.documento).includes(termoNorm)
    );
  });

  const funcionariosFiltrados = funcionarios.filter((f) => {
    if (!termoNorm) return true;
    return (
      normalizarTextoBusca(f.nomeOficial).includes(termoNorm) ||
      f.apelidos.some((a) => normalizarTextoBusca(a).includes(termoNorm)) ||
      normalizarTextoBusca(f.documento).includes(termoNorm) ||
      normalizarTextoBusca(f.empreiteiroNome).includes(termoNorm)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:hidden"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-slate-950 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HardHat className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-black tracking-tight">
              Cadastro de Empreiteiros &amp; Funcionários
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas */}
        <div className="px-5 pt-4 flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setAba('empreiteiros')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              aba === 'empreiteiros'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <HardHat className="w-3.5 h-3.5" />
            <span>Empreiteiros ({empreiteiros.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setAba('funcionarios')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              aba === 'funcionarios'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Funcionários ({funcionarios.length})</span>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {erro && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
              {erro}
            </div>
          )}

          {aba === 'empreiteiros' ? (
            <>
              <form
                onSubmit={handleSalvarEmpreiteiro}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Nome do Empreiteiro / Encarregado *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Alexandre Reis"
                      value={empNome}
                      onChange={(e) => setEmpNome(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Apelidos (separar por vírgula)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Alex, Reis"
                      value={empApelidos}
                      onChange={(e) => setEmpApelidos(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      CPF / CNPJ (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={empDocumento}
                      onChange={(e) => setEmpDocumento(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Etapa Padrão (opcional)
                    </label>
                    <select
                      value={empEtapaPadrao}
                      onChange={(e) => setEmpEtapaPadrao(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    >
                      <option value="">Sem etapa padrão</option>
                      {ETAPAS_PADRAO_OBRA.map((et) => (
                        <option key={et} value={et}>
                          {et}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {editEmpId && (
                    <button
                      type="button"
                      onClick={limparFormEmpreiteiro}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={salvando}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5"
                  >
                    {editEmpId ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Atualizar Empreiteiro</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar Empreiteiro</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrar empreiteiros..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                />
              </div>

              <div className="space-y-2">
                {empreiteirosFiltrados.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">
                    Nenhum empreiteiro cadastrado.
                  </p>
                ) : (
                  empreiteirosFiltrados.map((emp) => (
                    <div
                      key={emp.id}
                      className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 bg-white"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">
                          {emp.nome}
                          {emp.apelidos.length > 0 && (
                            <span className="font-medium text-slate-500 ml-1">
                              ({emp.apelidos.join(', ')})
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {[
                            emp.etapaPadrao ? `Etapa: ${emp.etapaPadrao}` : null,
                            emp.documento ? `Doc: ${emp.documento}` : null,
                          ]
                            .filter(Boolean)
                            .join(' • ') || 'Sem etapa padrão'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditEmpId(emp.id);
                            setEmpNome(emp.nome);
                            setEmpApelidos(emp.apelidos.join(', '));
                            setEmpDocumento(emp.documento || '');
                            setEmpEtapaPadrao(emp.etapaPadrao || '');
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemover('empreiteiro', emp.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <form
                onSubmit={handleSalvarFuncionario}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Empreiteiro / Encarregado
                    </label>
                    <select
                      value={funcEmpreiteiroId}
                      onChange={(e) => setFuncEmpreiteiroId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    >
                      <option value="">Sem vínculo específico</option>
                      {empreiteiros.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Nome Oficial *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Antônio Carlos (Tonho)"
                      value={funcNomeOficial}
                      onChange={(e) => setFuncNomeOficial(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Apelidos (separar por vírgula)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Tom, Tonho"
                      value={funcApelidos}
                      onChange={(e) => setFuncApelidos(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Documento (CPF / RG)
                    </label>
                    <input
                      type="text"
                      placeholder="CPF ou RG p/ portaria"
                      value={funcDocumento}
                      onChange={(e) => setFuncDocumento(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {editFuncId && (
                    <button
                      type="button"
                      onClick={limparFormFuncionario}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={salvando}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5"
                  >
                    {editFuncId ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Atualizar Funcionário</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar Funcionário</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nome, apelido, CPF/RG ou empreiteiro..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                />
              </div>

              <div className="space-y-2">
                {funcionariosFiltrados.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">
                    Nenhum funcionário cadastrado.
                  </p>
                ) : (
                  funcionariosFiltrados.map((f) => (
                    <div
                      key={f.id}
                      className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 bg-white"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">
                          {f.nomeOficial}
                          {f.apelidos.length > 0 && (
                            <span className="font-medium text-indigo-700 ml-1">
                              ({f.apelidos.join(', ')})
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {[
                            f.empreiteiroNome
                              ? `Equipe: ${f.empreiteiroNome}`
                              : 'Sem empreiteiro',
                            f.documento ? `Doc: ${f.documento}` : null,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditFuncId(f.id);
                            setFuncEmpreiteiroId(f.empreiteiroId || '');
                            setFuncNomeOficial(f.nomeOficial);
                            setFuncApelidos(f.apelidos.join(', '));
                            setFuncDocumento(f.documento || '');
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemover('funcionario', f.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
