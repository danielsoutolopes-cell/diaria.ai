'use client';

import React, { useState, useEffect } from 'react';
import {
  Layers,
  HardHat,
  CheckCircle,
  Waves,
  Building2,
  MapPin,
  Users,
  Sparkles,
  RefreshCw,
  CreditCard,
  Phone,
  Trash2,
  UserCheck,
  Edit2,
  X,
  Save,
} from 'lucide-react';
import { TipoObra } from '@/types/database';
import { supabase } from '@/lib/supabase';

interface ObraItem {
  id: string;
  nome: string;
  local: string;
  tipo_obra: TipoObra;
  valor_diaria_padrao?: number;
  ativo: boolean;
}

interface FuncionarioItem {
  id: string;
  nome_trabalhador: string;
  chave_pix: string | null;
  telefone: string | null;
  obra_id: string | null;
  funcao: string | null;
  is_encarregado?: boolean;
  regime_remuneracao?: 'DIARISTA' | 'SEMANALISTA' | 'QUINZENALISTA' | 'MENSALISTA';
  ciclo_pagamento?: 'SEMANAL' | 'QUINZENAL';
  valor_base_contratual?: number;
  valor_diaria: number;
  ativo: boolean;
  obras_config?: { nome: string } | null;
}

export default function SetupPage() {
  const [tabAtiva, setTabAtiva] = useState<'FUNCIONARIOS' | 'OBRAS'>('FUNCIONARIOS');
  
  // Obras
  const [obras, setObras] = useState<ObraItem[]>([]);
  const [loadingObras, setLoadingObras] = useState(true);
  const [cadastrandoObra, setCadastrandoObra] = useState(false);
  const [nomeObra, setNomeObra] = useState('');
  const [localObra, setLocalObra] = useState('');
  const [apelidosObra, setApelidosObra] = useState('');
  const [tipoObra, setTipoObra] = useState<TipoObra>('PISCINA');
  const [valorDiariaObra, setValorDiariaObra] = useState<string>('150');
  const [salvoObra, setSalvoObra] = useState(false);

  // Funcionários (Apenas Nome e Chave PIX obrigatórios)
  const [funcionarios, setFuncionarios] = useState<FuncionarioItem[]>([]);
  const [loadingFunc, setLoadingFunc] = useState(true);
  const [cadastrandoFunc, setCadastrandoFunc] = useState(false);
  const [nomeFuncionario, setNomeFuncionario] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [apelidosFuncionario, setApelidosFuncionario] = useState('');
  const [telefoneFunc, setTelefoneFunc] = useState('');
  const [obraFuncId, setObraFuncId] = useState('');
  const [isEncarregado, setIsEncarregado] = useState(false);
  const [regimeFunc, setRegimeFunc] = useState<'DIARISTA' | 'SEMANALISTA' | 'QUINZENALISTA'>('DIARISTA');
  const [cicloFunc, setCicloFunc] = useState<'SEMANAL' | 'QUINZENAL'>('QUINZENAL');
  const [valorDiariaCustom, setValorDiariaCustom] = useState('');
  const [salvoFunc, setSalvoFunc] = useState(false);

  // Estados de Edição Modal/Inline
  const [editingFunc, setEditingFunc] = useState<FuncionarioItem | null>(null);
  const [editFuncNome, setEditFuncNome] = useState('');
  const [editFuncPix, setEditFuncPix] = useState('');
  const [editFuncTelefone, setEditFuncTelefone] = useState('');
  const [editFuncValor, setEditFuncValor] = useState('');
  const [editFuncValorPiscina, setEditFuncValorPiscina] = useState('');
  const [editFuncRegime, setEditFuncRegime] = useState<'DIARISTA' | 'SEMANALISTA' | 'QUINZENALISTA' | 'MENSALISTA'>('DIARISTA');
  const [editFuncCiclo, setEditFuncCiclo] = useState<'SEMANAL' | 'QUINZENAL'>('SEMANAL');
  const [editFuncApelidos, setEditFuncApelidos] = useState('');
  const [salvandoEdicaoFunc, setSalvandoEdicaoFunc] = useState(false);

  // Estados de Exclusão Inteligente com Verificação de Apontamentos
  const [excluindoFunc, setExcluindoFunc] = useState<FuncionarioItem | null>(null);
  const [modalExclusao, setModalExclusao] = useState<{
    aberto: boolean;
    temVinculos: boolean;
    mensagem: string;
    totalApontamentos: number;
    pontos: number;
    vales: number;
    transferirParaId: string;
    excluindo: boolean;
  } | null>(null);

  // Tabela de Preços Duplos Obra vs. Piscina
  const [precosDuplos, setPrecosDuplos] = useState<Record<string, { obra: number | null; piscina: number | null }>>({});

  async function carregarPrecosDuplos() {
    try {
      const res = await fetch('/api/precos-duplos');
      const data = await res.json();
      if (data) {
        setPrecosDuplos(data.precos || data.padrao || {});
      }
    } catch (e) {
      console.error('Erro ao buscar precos duplos:', e);
    }
  }

  const [editingObra, setEditingObra] = useState<ObraItem | null>(null);
  const [editObraNome, setEditObraNome] = useState('');
  const [editObraLocal, setEditObraLocal] = useState('');
  const [editObraTipo, setEditObraTipo] = useState<TipoObra>('PISCINA');
  const [editObraValor, setEditObraValor] = useState('');
  const [editObraApelidos, setEditObraApelidos] = useState('');
  const [salvandoEdicaoObra, setSalvandoEdicaoObra] = useState(false);

  // Mapa de Apelidos Carregados
  const [mapaApelidos, setMapaApelidos] = useState<{
    obras: Record<string, string[]>;
    funcionarios: Record<string, string[]>;
  }>({ obras: {}, funcionarios: {} });

  async function carregarApelidos() {
    try {
      const res = await fetch('/api/apelidos');
      const data = await res.json();
      if (data && data.apelidos) {
        setMapaApelidos(data.apelidos);
      }
    } catch (e) {
      console.error('Erro ao buscar apelidos:', e);
    }
  }

  async function carregarObras() {
    setLoadingObras(true);
    try {
      const res = await fetch('/api/obras');
      const data = await res.json();
      if (data && data.obras) {
        setObras(data.obras as ObraItem[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingObras(false);
    }
  }

  async function carregarFuncionarios() {
    setLoadingFunc(true);
    try {
      const res = await fetch('/api/funcionarios');
      const data = await res.json();
      if (data && data.funcionarios) {
        setFuncionarios(data.funcionarios as unknown as FuncionarioItem[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFunc(false);
    }
  }

  useEffect(() => {
    carregarObras();
    carregarFuncionarios();
    carregarApelidos();
    carregarPrecosDuplos();
  }, []);

  async function handleAddObra(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeObra.trim()) return;

    setCadastrandoObra(true);
    try {
      const valorFinal = Number(valorDiariaObra) || (tipoObra === 'PISCINA' ? 150 : 180);
      const listaApelidos = apelidosObra
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await fetch('/api/obras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeObra.trim().toUpperCase(),
          local: localObra.trim() || 'Canteiro Volante',
          tipo_obra: tipoObra,
          valor_diaria_padrao: valorFinal,
          apelidos: listaApelidos,
        }),
      });
      const data = await res.json();

      if (data && data.obra) {
        setObras((prev) => [data.obra as ObraItem, ...prev]);
        setNomeObra('');
        setLocalObra('');
        setApelidosObra('');
        setSalvoObra(true);
        carregarApelidos();
        setTimeout(() => setSalvoObra(false), 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCadastrandoObra(false);
    }
  }

  async function handleAddFuncionario(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeFuncionario.trim() || !chavePix.trim()) {
      alert('Nome e Chave PIX são obrigatórios.');
      return;
    }

    setCadastrandoFunc(true);
    try {
      // Se não informar diária, pega padrão da obra selecionada ou 150
      let valorFinal = 150;
      if (valorDiariaCustom && !isNaN(Number(valorDiariaCustom))) {
        valorFinal = Number(valorDiariaCustom);
      } else if (obraFuncId) {
        const obraSel = obras.find((o) => o.id === obraFuncId);
        if (obraSel) {
          valorFinal = obraSel.tipo_obra === 'PISCINA' ? 150 : 180;
        }
      }

      const listaApelidos = apelidosFuncionario
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await fetch('/api/funcionarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_trabalhador: nomeFuncionario.trim(),
          chave_pix: chavePix.trim(),
          telefone: telefoneFunc.trim() || null,
          obra_id: obraFuncId || null,
          is_encarregado: isEncarregado,
          regime_remuneracao: regimeFunc,
          ciclo_pagamento: cicloFunc,
          valor_base_contratual: valorFinal,
          valor_diaria: valorFinal,
          funcao: isEncarregado || regimeFunc === 'SEMANALISTA' ? 'ENCARREGADO' : 'OPERACIONAL',
          apelidos: listaApelidos,
        }),
      });
      const data = await res.json();

      if (data && data.funcionario) {
        setFuncionarios((prev) => [data.funcionario as unknown as FuncionarioItem, ...prev]);
        setNomeFuncionario('');
        setChavePix('');
        setApelidosFuncionario('');
        setTelefoneFunc('');
        setValorDiariaCustom('');
        setSalvoFunc(true);
        carregarApelidos();
        setTimeout(() => setSalvoFunc(false), 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCadastrandoFunc(false);
    }
  }

  function handleStartEditFunc(f: FuncionarioItem) {
    setEditingFunc(f);
    setEditFuncNome(f.nome_trabalhador);
    setEditFuncPix(f.chave_pix || '');
    setEditFuncTelefone(f.telefone || '');
    
    // Obter valores de Obra e Piscina
    const precos = precosDuplos[f.id] || precosDuplos[f.nome_trabalhador] || {};
    const valObra = precos.obra !== undefined ? precos.obra : (f.valor_base_contratual || f.valor_diaria || 180);
    const valPiscina = precos.piscina !== undefined ? precos.piscina : null;

    setEditFuncValor(valObra !== null ? String(valObra) : '');
    setEditFuncValorPiscina(valPiscina !== null ? String(valPiscina) : '');
    setEditFuncRegime(f.regime_remuneracao || 'DIARISTA');
    setEditFuncCiclo(f.ciclo_pagamento || 'SEMANAL');
    setEditFuncApelidos((mapaApelidos.funcionarios[f.id] || []).join(', '));
  }

  async function handleSalvarEditFunc(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFunc) return;
    setSalvandoEdicaoFunc(true);

    try {
      const listaApelidos = editFuncApelidos
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);

      const valObra = editFuncValor ? Number(editFuncValor) : null;
      const valPiscina = editFuncValorPiscina ? Number(editFuncValorPiscina) : null;

      // 1. Atualizar Funcionário Base
      const res = await fetch('/api/funcionarios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingFunc.id,
          nome_trabalhador: editFuncNome,
          chave_pix: editFuncPix,
          telefone: editFuncTelefone || null,
          valor_diaria: valObra || valPiscina || 150,
          valor_base_contratual: valObra || valPiscina || 150,
          regime_remuneracao: editFuncRegime,
          ciclo_pagamento: editFuncCiclo,
          apelidos: listaApelidos,
        }),
      });

      // 2. Salvar Matriz Obra vs. Piscina
      const novosPrecos = {
        ...precosDuplos,
        [editingFunc.id]: { obra: valObra, piscina: valPiscina },
        [editFuncNome]: { obra: valObra, piscina: valPiscina },
      };
      await fetch('/api/precos-duplos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precos: novosPrecos }),
      });
      setPrecosDuplos(novosPrecos);

      const data = await res.json();
      if (data && data.funcionario) {
        setFuncionarios((prev) =>
          prev.map((item) => (item.id === editingFunc.id ? (data.funcionario as unknown as FuncionarioItem) : item))
        );
        setEditingFunc(null);
        carregarApelidos();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSalvandoEdicaoFunc(false);
    }
  }

  async function handleSolicitarExclusaoFunc(f: FuncionarioItem) {
    setExcluindoFunc(f);
    try {
      const res = await fetch(`/api/funcionarios?id=${f.id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.temVinculos) {
        setModalExclusao({
          aberto: true,
          temVinculos: true,
          mensagem: data.mensagem,
          totalApontamentos: data.totalApontamentos,
          pontos: data.pontos,
          vales: data.vales,
          transferirParaId: '',
          excluindo: false,
        });
      } else if (data.success) {
        setFuncionarios((prev) => prev.filter((item) => item.id !== f.id));
        setExcluindoFunc(null);
      }
    } catch (err) {
      console.error('Erro ao verificar exclusão:', err);
    }
  }

  async function handleConfirmarExclusaoComOuSemTransferencia(forcarSemTransferir = false) {
    if (!excluindoFunc || !modalExclusao) return;
    setModalExclusao((prev) => (prev ? { ...prev, excluindo: true } : null));

    try {
      let url = `/api/funcionarios?id=${excluindoFunc.id}`;
      if (forcarSemTransferir) {
        url += '&force=true';
      } else if (modalExclusao.transferirParaId) {
        url += `&transferirParaId=${modalExclusao.transferirParaId}`;
      }

      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        setFuncionarios((prev) => prev.filter((item) => item.id !== excluindoFunc.id));
        setModalExclusao(null);
        setExcluindoFunc(null);
      }
    } catch (err) {
      console.error('Erro ao confirmar exclusão:', err);
    } finally {
      setModalExclusao((prev) => (prev ? { ...prev, excluindo: false } : null));
    }
  }

  function handleStartEditObra(o: ObraItem) {
    setEditingObra(o);
    setEditObraNome(o.nome);
    setEditObraLocal(o.local || '');
    setEditObraTipo(o.tipo_obra || 'PISCINA');
    setEditObraValor(String(o.valor_diaria_padrao || (o.tipo_obra === 'PISCINA' ? 150 : 180)));
    setEditObraApelidos((mapaApelidos.obras[o.id] || []).join(', '));
  }

  async function handleSalvarEditObra(e: React.FormEvent) {
    e.preventDefault();
    if (!editingObra) return;
    setSalvandoEdicaoObra(true);

    try {
      const listaApelidos = editObraApelidos
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);

      const val = Number(editObraValor) || (editObraTipo === 'PISCINA' ? 150 : 180);
      const res = await fetch('/api/obras', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingObra.id,
          nome: editObraNome,
          local: editObraLocal,
          tipo_obra: editObraTipo,
          valor_diaria_padrao: val,
          apelidos: listaApelidos,
        }),
      });

      const data = await res.json();
      if (data && data.obra) {
        setObras((prev) =>
          prev.map((item) => (item.id === editingObra.id ? (data.obra as unknown as ObraItem) : item))
        );
        setEditingObra(null);
        carregarApelidos();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSalvandoEdicaoObra(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Layers className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Configurações & Cadastros
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 mt-1">Lançamentos em Lote (Setup)</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Cadastre os colaboradores de campo (apenas Nome e Chave PIX) e as obras ativas para o cálculo automático.
          </p>
        </div>

        {/* Tabs switcher */}
        <div className="flex items-center bg-slate-200/70 p-1.5 rounded-2xl gap-1">
          <button
            onClick={() => setTabAtiva('FUNCIONARIOS')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              tabAtiva === 'FUNCIONARIOS'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Colaboradores ({funcionarios.length})</span>
          </button>
          <button
            onClick={() => setTabAtiva('OBRAS')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              tabAtiva === 'OBRAS'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <HardHat className="w-4 h-4" />
            <span>Obras & Canteiros ({obras.length})</span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: FUNCIONÁRIOS ================= */}
      {tabAtiva === 'FUNCIONARIOS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Form Cadastro Rápido */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold uppercase tracking-wider">
                <UserCheck className="w-4 h-4" />
                <span>Cadastro Expresso</span>
              </div>
              <h2 className="text-lg font-black text-slate-950">Novo Colaborador</h2>
              <p className="text-xs text-slate-500">
                Apenas o <strong>Nome</strong> e a <strong>Chave PIX</strong> são obrigatórios para liquidação do borderô.
              </p>
            </div>

            <form onSubmit={handleAddFuncionario} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Nome do Trabalhador *</span>
                  <span className="text-[10px] text-emerald-600 font-bold uppercase">Obrigatório</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: José da Silva (Pedreiro)"
                  value={nomeFuncionario}
                  onChange={(e) => setNomeFuncionario(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Chave PIX para Pagamento *</span>
                  <span className="text-[10px] text-emerald-600 font-bold uppercase">Obrigatório</span>
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    placeholder="CPF, Telefone, E-mail ou Aleatória"
                    value={chavePix}
                    onChange={(e) => setChavePix(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Campo de Apelidos do Colaborador */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-700">Apelidos / Como é chamado no WhatsApp</label>
                  <span className="text-[11px] text-emerald-600 font-bold">1 ou mais (separe por vírgula)</span>
                </div>
                <input
                  type="text"
                  placeholder="Ex: Peu, Peuzinho, Zé baiano, Wender 22"
                  value={apelidosFuncionario}
                  onChange={(e) => setApelidosFuncionario(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                />
                <p className="text-[11px] text-slate-400">
                  A IA usará esses apelidos para identificar este colaborador nas mensagens dos grupos.
                </p>
              </div>

              {/* Flag Encarregado */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Este colaborador é Encarregado de Obra?</span>
                  <span className="text-[11px] text-slate-500">Ele lidera canteiros e pode enviar o ponto no WhatsApp</span>
                </div>
                <input
                  type="checkbox"
                  checked={isEncarregado}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsEncarregado(checked);
                    if (checked && regimeFunc === 'DIARISTA') {
                      setRegimeFunc('SEMANALISTA');
                      setCicloFunc('SEMANAL');
                    }
                  }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Regime de Pagamento</label>
                  <select
                    value={regimeFunc}
                    onChange={(e: any) => {
                      const reg = e.target.value;
                      setRegimeFunc(reg);
                      if (reg === 'SEMANALISTA') setCicloFunc('SEMANAL');
                      if (reg === 'QUINZENALISTA') setCicloFunc('QUINZENAL');
                    }}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  >
                    <option value="DIARISTA">Diarista (Por Dia)</option>
                    <option value="SEMANALISTA">Semanalista Fixo (Encarregado)</option>
                    <option value="QUINZENALISTA">Quinzenalista Fixo</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Ciclo do Fechamento</label>
                  <select
                    value={cicloFunc}
                    onChange={(e: any) => setCicloFunc(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  >
                    <option value="SEMANAL">Toda Sexta (Semanal)</option>
                    <option value="QUINZENAL">Quinzenal (15 Dias)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">WhatsApp / Cel</label>
                  <input
                    type="text"
                    placeholder="(11) 9...."
                    value={telefoneFunc}
                    onChange={(e) => setTelefoneFunc(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    {regimeFunc === 'SEMANALISTA' ? 'Fixo Semanal (R$)' : regimeFunc === 'QUINZENALISTA' ? 'Fixo Quinzena (R$)' : 'Diária (R$)'}
                  </label>
                  <input
                    type="number"
                    step="5"
                    placeholder={regimeFunc === 'SEMANALISTA' ? 'Ex: 1500' : 'Ex: 150'}
                    value={valorDiariaCustom}
                    onChange={(e) => setValorDiariaCustom(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Canteiro / Obra Principal</label>
                <select
                  value={obraFuncId}
                  onChange={(e) => setObraFuncId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                >
                  <option value="">Equipe Volante / Todas as Obras</option>
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome} ({o.tipo_obra === 'PISCINA' ? 'Piscina - R$150' : 'Civil - R$180'})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={cadastrandoFunc}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-emerald-700/20 active:scale-95 disabled:opacity-50"
              >
                {cadastrandoFunc ? 'Cadastrando...' : 'Salvar Colaborador'}
              </button>

              {salvoFunc && (
                <p className="text-xs text-emerald-700 font-bold flex items-center justify-center gap-1.5 pt-1">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Colaborador salvo com sucesso!
                </p>
              )}
            </form>
          </div>

          {/* Lista de Colaboradores */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-950 text-base">
                Colaboradores Cadastrados ({funcionarios.length})
              </h2>
              <button
                onClick={carregarFuncionarios}
                className="text-xs text-emerald-600 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFunc ? 'animate-spin' : ''}`} />
                Atualizar lista
              </button>
            </div>

            {loadingFunc ? (
              <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                <p className="text-sm text-slate-500">Carregando colaboradores...</p>
              </div>
            ) : funcionarios.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Nenhum colaborador cadastrado ainda</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Cadastre o primeiro colaborador ao lado com Nome e Chave PIX. Ao reconhecer o nome no WhatsApp, a IA já vincula os pagamentos.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {funcionarios.map((f) => (
                  <div
                    key={f.id}
                    className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-black text-sm text-slate-950">{f.nome_trabalhador}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                            {f.obras_config?.nome || 'Equipe Volante'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            f.regime_remuneracao === 'SEMANALISTA' 
                              ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                              : f.regime_remuneracao === 'QUINZENALISTA'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {f.regime_remuneracao === 'SEMANALISTA' ? 'Semanalista Fixo' : f.regime_remuneracao === 'QUINZENALISTA' ? 'Quinzenalista Fixo' : 'Diarista'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {(() => {
                          const p = precosDuplos[f.id] || precosDuplos[f.nome_trabalhador] || {};
                          const valObra = p.obra !== undefined ? p.obra : (f.valor_base_contratual || f.valor_diaria);
                          const valPiscina = p.piscina !== undefined ? p.piscina : null;
                          const isDiego = f.nome_trabalhador.includes('DIEGO');

                          if (isDiego) {
                            return (
                              <div className="text-right">
                                <span className="text-xs font-black text-purple-900 bg-purple-50 border border-purple-200/80 px-2.5 py-1 rounded-xl block">
                                  R$ 8.700,00 <span className="text-[10px] text-purple-600 font-normal">/mês</span>
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 mt-0.5 block">
                                  (R$ 2.175,00/semana)
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-center gap-2">
                              {valObra !== null && (
                                <div className="text-right">
                                  <span className="text-[10px] uppercase font-bold text-amber-700 block">Obra</span>
                                  <span className="text-xs font-black text-amber-950 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-lg">
                                    R$ {Number(valObra).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {valPiscina !== null ? (
                                <div className="text-right">
                                  <span className="text-[10px] uppercase font-bold text-sky-700 block">Piscina</span>
                                  <span className="text-xs font-black text-sky-950 bg-sky-50 border border-sky-200/70 px-2 py-0.5 rounded-lg">
                                    R$ {Number(valPiscina).toFixed(2)}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-right">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Piscina</span>
                                  <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                                    -
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px] truncate">
                          PIX: <strong>{f.chave_pix || 'Não informada'}</strong>
                        </span>
                      </div>
                      {f.telefone && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-[11px]">{f.telefone}</span>
                        </div>
                      )}

                      {/* Exibição dos Apelidos Cadastrados */}
                      {mapaApelidos.funcionarios[f.id] && mapaApelidos.funcionarios[f.id].length > 0 && (
                        <div className="pt-1.5 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-bold">Apelidos:</span>
                          {mapaApelidos.funcionarios[f.id].map((ap, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200/60"
                            >
                              {ap}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleSolicitarExclusaoFunc(f)}
                          className="px-2.5 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1"
                          title="Excluir Colaborador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEditFunc(f)}
                          className="px-3 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 border border-slate-200/80"
                        >
                          <Edit2 className="w-3 h-3" />
                          Editar Dados
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: OBRAS ================= */}
      {tabAtiva === 'OBRAS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Form Cadastro Obra */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Parâmetros de Canteiro</span>
              </div>
              <h2 className="text-lg font-black text-slate-950">Cadastrar Nova Obra</h2>
              <p className="text-xs text-slate-500">
                Define a regra de diária padrão usada automaticamente pelo WhatsApp e Terminal de IA.
              </p>
            </div>

            <form onSubmit={handleAddObra} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Identificação da Obra *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Condomínio Alphaville - Lote 14"
                  value={nomeObra}
                  onChange={(e) => setNomeObra(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Localização / Cidade</label>
                <input
                  type="text"
                  placeholder="Ex: Barueri - SP"
                  value={localObra}
                  onChange={(e) => setLocalObra(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              {/* Campo de Apelidos da Obra */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-700">Apelidos / Como chamam no WhatsApp</label>
                  <span className="text-[11px] text-emerald-600 font-bold">1 ou mais (separe por vírgula)</span>
                </div>
                <input
                  type="text"
                  placeholder="Ex: Bahia, Porto Seguro, Piscina Porto Seguro, Alphaville"
                  value={apelidosObra}
                  onChange={(e) => setApelidosObra(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                />
                <p className="text-[11px] text-slate-400">
                  A IA usará esses termos para vincular automaticamente as mensagens a esta obra.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Tipo da Obra</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTipoObra('PISCINA');
                      setValorDiariaObra('150');
                    }}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                      tipoObra === 'PISCINA'
                        ? 'border-sky-500 bg-sky-50/80 text-sky-900 shadow-sm ring-2 ring-sky-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Waves className="w-5 h-5 text-sky-500" />
                    <span>Piscina</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTipoObra('OBRA_CIVIL');
                      setValorDiariaObra('180');
                    }}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                      tipoObra === 'OBRA_CIVIL'
                        ? 'border-amber-500 bg-amber-50/80 text-amber-900 shadow-sm ring-2 ring-amber-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-5 h-5 text-amber-500" />
                    <span>Obra Civil</span>
                  </button>
                </div>
              </div>

              {/* Campo Editável de Diária Padrão */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-700">Valor da Diária Padrão (R$)</label>
                  <span className="text-[11px] text-slate-400 font-medium">Editável</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    step="5"
                    min="50"
                    required
                    value={valorDiariaObra}
                    onChange={(e) => setValorDiariaObra(e.target.value)}
                    placeholder="150"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Defina o valor base para este canteiro (sugestão: R$ 150 para Piscina e R$ 180 para Civil).
                </p>
              </div>

              <button
                type="submit"
                disabled={cadastrandoObra}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-emerald-700/20 active:scale-95 disabled:opacity-50"
              >
                {cadastrandoObra ? 'Salvando no Banco...' : 'Adicionar Obra ao Sistema'}
              </button>

              {salvoObra && (
                <p className="text-xs text-emerald-700 font-bold flex items-center justify-center gap-1.5 pt-1">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Obra registrada com sucesso!
                </p>
              )}
            </form>
          </div>

          {/* Lista de Obras */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-950 text-base">Canteiros Ativos ({obras.length})</h2>
              <button
                onClick={carregarObras}
                className="text-xs text-emerald-600 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingObras ? 'animate-spin' : ''}`} />
                Atualizar canteiros
              </button>
            </div>

            {loadingObras ? (
              <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                <p className="text-sm text-slate-500">Carregando canteiros...</p>
              </div>
            ) : obras.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                  <HardHat className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Nenhum canteiro cadastrado</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Use o formulário para cadastrar a primeira obra ou deixe que o WhatsApp Bot crie automaticamente ao receber mensagens de campo.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {obras.map((o) => (
                  <div
                    key={o.id}
                    className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {o.tipo_obra === 'PISCINA' ? (
                          <span className="p-2 bg-sky-50 text-sky-600 rounded-xl">
                            <Waves className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                            <Building2 className="w-4 h-4" />
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            o.tipo_obra === 'PISCINA'
                              ? 'bg-sky-50 text-sky-800 border border-sky-200/60'
                              : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                          }`}
                        >
                          {o.tipo_obra === 'PISCINA' ? 'Piscina' : 'Obra Civil'}
                        </span>
                      </div>

                      <span className="text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                        Ativa
                      </span>
                    </div>

                    <div>
                      <h3 className="font-black text-base text-slate-950">{o.nome}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{o.local}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Diária Padrão:</span>
                        <span className="font-black text-slate-950 text-xs">
                          R$ {Number(o.valor_diaria_padrao || (o.tipo_obra === 'PISCINA' ? 150 : 180)).toFixed(2)}
                        </span>
                      </div>

                      {/* Exibição dos Apelidos da Obra */}
                      {mapaApelidos.obras[o.id] && mapaApelidos.obras[o.id].length > 0 && (
                        <div className="pt-1 flex flex-wrap items-center gap-1 border-t border-slate-100/70">
                          <span className="text-[10px] text-slate-400 font-bold">Apelidos no Zap:</span>
                          {mapaApelidos.obras[o.id].map((ap, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-bold bg-sky-50 text-sky-800 px-2 py-0.5 rounded-lg border border-sky-200/60"
                            >
                              {ap}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleStartEditObra(o)}
                          className="px-3 py-1 bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-700 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 border border-slate-200/80"
                        >
                          <Edit2 className="w-3 h-3" />
                          Editar Obra
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL DE EDIÇÃO DE FUNCIONÁRIO ================= */}
      {editingFunc && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">Editar Colaborador</h3>
                <p className="text-xs text-slate-500">Altere nome, chave PIX, diária contratual e regime.</p>
              </div>
              <button
                onClick={() => setEditingFunc(null)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarEditFunc} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={editFuncNome}
                  onChange={(e) => setEditFuncNome(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Chave PIX *</label>
                  <input
                    type="text"
                    required
                    value={editFuncPix}
                    onChange={(e) => setEditFuncPix(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Telefone / Zap</label>
                  <input
                    type="text"
                    value={editFuncTelefone}
                    onChange={(e) => setEditFuncTelefone(e.target.value)}
                    placeholder="24999999999"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-amber-800 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    Valor Obra Civil (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 250.00"
                    value={editFuncValor}
                    onChange={(e) => setEditFuncValor(e.target.value)}
                    className="w-full px-4 py-2.5 bg-amber-50/50 border border-amber-200 rounded-xl text-xs font-bold text-amber-950 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-sky-800 flex items-center gap-1">
                    <Waves className="w-3.5 h-3.5" />
                    Valor Piscina (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 450.00 ou vazio"
                    value={editFuncValorPiscina}
                    onChange={(e) => setEditFuncValorPiscina(e.target.value)}
                    className="w-full px-4 py-2.5 bg-sky-50/50 border border-sky-200 rounded-xl text-xs font-bold text-sky-950 focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Regime</label>
                  <select
                    value={editFuncRegime}
                    onChange={(e) => setEditFuncRegime(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="DIARISTA">Diarista</option>
                    <option value="SEMANALISTA">Semanalista</option>
                    <option value="QUINZENALISTA">Quinzenalista</option>
                    <option value="MENSALISTA">Mensalista (Diego - Rateio Semanal)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Ciclo Pgto</label>
                  <select
                    value={editFuncCiclo}
                    onChange={(e) => setEditFuncCiclo(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="SEMANAL">Sexta (Semanal)</option>
                    <option value="QUINZENAL">Quinzenal</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Apelidos de Reconhecimento no Zap</label>
                <input
                  type="text"
                  value={editFuncApelidos}
                  onChange={(e) => setEditFuncApelidos(e.target.value)}
                  placeholder="Ex: Gil, Gilvan, Gilzinho"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400">Separe os apelidos por vírgula.</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingFunc(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicaoFunc}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {salvandoEdicaoFunc ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL DE EDIÇÃO DE OBRA ================= */}
      {editingObra && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">Editar Canteiro / Obra</h3>
                <p className="text-xs text-slate-500">Altere o nome, localização, tipo de serviço e diária padrão.</p>
              </div>
              <button
                onClick={() => setEditingObra(null)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarEditObra} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Identificação da Obra *</label>
                <input
                  type="text"
                  required
                  value={editObraNome}
                  onChange={(e) => setEditObraNome(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Cidade / Localização</label>
                  <input
                    type="text"
                    value={editObraLocal}
                    onChange={(e) => setEditObraLocal(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tipo de Obra</label>
                  <select
                    value={editObraTipo}
                    onChange={(e) => setEditObraTipo(e.target.value as TipoObra)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="PISCINA">Construção de Piscina</option>
                    <option value="OBRA_CIVIL">Construção Civil</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Diária Padrão da Obra (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editObraValor}
                  onChange={(e) => setEditObraValor(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Apelidos no WhatsApp</label>
                <input
                  type="text"
                  value={editObraApelidos}
                  onChange={(e) => setEditObraApelidos(e.target.value)}
                  placeholder="Ex: Bahia, Porto Seguro, Piscina Porto Seguro"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-[10px] text-slate-400">Separe os apelidos por vírgula.</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingObra(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicaoObra}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {salvandoEdicaoObra ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL DE EXCLUSÃO INTELIGENTE & TRANSFERÊNCIA ================= */}
      {modalExclusao && excluindoFunc && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-50 rounded-2xl border border-red-200/80">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Excluir Colaborador</h3>
                <p className="text-xs text-slate-500">{excluindoFunc.nome_trabalhador}</p>
              </div>
            </div>

            {modalExclusao.temVinculos ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-amber-900 leading-relaxed space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <span>⚠️ Atenção: Registros Financeiros Encontrados</span>
                  </p>
                  <p>
                    O colaborador possui <strong>{modalExclusao.totalApontamentos} lançamento(s)</strong> no histórico ({modalExclusao.pontos} diárias e {modalExclusao.vales} vales).
                  </p>
                  <p className="text-[11px] text-amber-800">
                    Para não corromper o borderô nem perder o histórico financeiro, selecione um colaborador para <strong>transferir esses lançamentos</strong>:
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Transferir Apontamentos Para:</label>
                  <select
                    value={modalExclusao.transferirParaId}
                    onChange={(e) =>
                      setModalExclusao((prev) => (prev ? { ...prev, transferirParaId: e.target.value } : null))
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Selecione o novo responsável...</option>
                    {funcionarios
                      .filter((f) => f.id !== excluindoFunc.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome_trabalhador} ({f.chave_pix || 'Sem PIX'})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={!modalExclusao.transferirParaId || modalExclusao.excluindo}
                    onClick={() => handleConfirmarExclusaoComOuSemTransferencia(false)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <UserCheck className="w-4 h-4" />
                    {modalExclusao.excluindo ? 'Transferindo...' : 'Transferir Registros e Excluir'}
                  </button>

                  <button
                    type="button"
                    disabled={modalExclusao.excluindo}
                    onClick={() => handleConfirmarExclusaoComOuSemTransferencia(true)}
                    className="w-full py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl text-[11px] font-semibold transition-all"
                  >
                    Excluir mesmo assim (Manter histórico original)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalExclusao(null);
                      setExcluindoFunc(null);
                    }}
                    className="w-full py-1.5 text-slate-400 hover:text-slate-600 text-xs font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tem certeza que deseja inativar o colaborador <strong>{excluindoFunc.nome_trabalhador}</strong>? Ele não possui lançamentos financeiros vinculados.
                </p>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setModalExclusao(null);
                      setExcluindoFunc(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={modalExclusao.excluindo}
                    onClick={() => handleConfirmarExclusaoComOuSemTransferencia(true)}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                  >
                    {modalExclusao.excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
