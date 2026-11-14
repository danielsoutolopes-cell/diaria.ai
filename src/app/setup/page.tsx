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
  const [tipoObra, setTipoObra] = useState<TipoObra>('PISCINA');
  const [valorDiariaObra, setValorDiariaObra] = useState<string>('150');
  const [salvoObra, setSalvoObra] = useState(false);

  // Funcionários (Apenas Nome e Chave PIX obrigatórios)
  const [funcionarios, setFuncionarios] = useState<FuncionarioItem[]>([]);
  const [loadingFunc, setLoadingFunc] = useState(true);
  const [cadastrandoFunc, setCadastrandoFunc] = useState(false);
  const [nomeFuncionario, setNomeFuncionario] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [telefoneFunc, setTelefoneFunc] = useState('');
  const [obraFuncId, setObraFuncId] = useState('');
  const [valorDiariaCustom, setValorDiariaCustom] = useState('');
  const [salvoFunc, setSalvoFunc] = useState(false);

  async function carregarObras() {
    setLoadingObras(true);
    try {
      const { data } = await supabase
        .from('obras_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setObras(data as ObraItem[]);
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
      const { data } = await supabase
        .from('funcionarios_obra')
        .select(`
          id,
          nome_trabalhador,
          chave_pix,
          telefone,
          obra_id,
          funcao,
          valor_diaria,
          ativo,
          obras_config (
            nome
          )
        `)
        .order('nome_trabalhador', { ascending: true });

      if (data) {
        setFuncionarios(data as unknown as FuncionarioItem[]);
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
  }, []);

  async function handleAddObra(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeObra.trim()) return;

    setCadastrandoObra(true);
    try {
      const valorFinal = Number(valorDiariaObra) || (tipoObra === 'PISCINA' ? 150 : 180);

      const { data } = await supabase
        .from('obras_config')
        .insert({
          tenant_id: '00000000-0000-0000-0000-000000000001',
          nome: nomeObra.trim().toUpperCase(),
          local: localObra.trim() || 'Canteiro Volante',
          tipo_obra: tipoObra,
          valor_diaria_padrao: valorFinal,
        })
        .select()
        .single();

      if (data) {
        setObras((prev) => [data as ObraItem, ...prev]);
        setNomeObra('');
        setLocalObra('');
        setSalvoObra(true);
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

      const { data } = await supabase
        .from('funcionarios_obra')
        .insert({
          tenant_id: '00000000-0000-0000-0000-000000000001',
          nome_trabalhador: nomeFuncionario.trim(),
          chave_pix: chavePix.trim(),
          telefone: telefoneFunc.trim() || null,
          obra_id: obraFuncId || null,
          valor_diaria: valorFinal,
          funcao: 'OPERACIONAL',
        })
        .select(`
          id,
          nome_trabalhador,
          chave_pix,
          telefone,
          obra_id,
          funcao,
          valor_diaria,
          ativo,
          obras_config (
            nome
          )
        `)
        .single();

      if (data) {
        setFuncionarios((prev) => [data as unknown as FuncionarioItem, ...prev]);
        setNomeFuncionario('');
        setChavePix('');
        setTelefoneFunc('');
        setValorDiariaCustom('');
        setSalvoFunc(true);
        setTimeout(() => setSalvoFunc(false), 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCadastrandoFunc(false);
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
                  <label className="text-xs font-bold text-slate-700">Diária (R$)</label>
                  <input
                    type="number"
                    step="5"
                    placeholder="Ex: 150"
                    value={valorDiariaCustom}
                    onChange={(e) => setValorDiariaCustom(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
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
                        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                          {f.obras_config?.nome || 'Equipe Volante'}
                        </span>
                      </div>
                      <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-xl">
                        R$ {Number(f.valor_diaria).toFixed(2)}
                      </span>
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

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Diária Padrão:</span>
                      <span className="font-black text-slate-950 text-xs">
                        R$ {Number(o.valor_diaria_padrao || (o.tipo_obra === 'PISCINA' ? 150 : 180)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
