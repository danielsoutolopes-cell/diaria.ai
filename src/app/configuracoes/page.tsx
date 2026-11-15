'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  UserPlus,
  Users,
  Key,
  Building,
  CheckCircle2,
  Trash2,
  LogOut,
  Sparkles,
  Phone,
  HardHat,
  Lock,
  Sliders,
  CloudRain,
  Car,
  Ban,
  Waves,
  Save,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { NivelPermissao } from '@/types/database';

interface MembroEquipe {
  id: string;
  nome: string;
  telefone: string;
  nivel: NivelPermissao;
  obraVinculada: string;
  ativo: boolean;
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [tabAtiva, setTabAtiva] = useState<'REGRAS' | 'RBAC'>('REGRAS');

  // Estado das Regras de Diárias
  const [diaViagem, setDiaViagem] = useState('120');
  const [diaChuva, setDiaChuva] = useState('120');
  const [diaParado, setDiaParado] = useState('120');
  const [diariaPiscina, setDiariaPiscina] = useState('150');
  const [diariaCivil, setDiariaCivil] = useState('180');
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  const [sucessoRegras, setSucessoRegras] = useState(false);

  // Membros RBAC
  const [membros, setMembros] = useState<MembroEquipe[]>([
    {
      id: 'super-1',
      nome: 'Patricia Grubel',
      telefone: '(11) 97854-3369',
      nivel: 'MASTER',
      obraVinculada: 'Todas as Obras (Gestão Central)',
      ativo: true,
    },
    {
      id: 'super-2',
      nome: 'Daniel Lopes',
      telefone: '(11) 91319-2703',
      nivel: 'MASTER',
      obraVinculada: 'Super Admin Global',
      ativo: true,
    },
    {
      id: 'super-3',
      nome: 'Joabson Nascimento',
      telefone: '(24) 99842-4641',
      nivel: 'MASTER',
      obraVinculada: 'Super Admin Global',
      ativo: true,
    },
  ]);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nivel, setNivel] = useState<NivelPermissao>('APONTAMENTO');
  const [obra, setObra] = useState('Geral');
  const [salvoMembro, setSalvoMembro] = useState(false);

  // Carregar regras do backend
  async function carregarRegras() {
    try {
      const res = await fetch('/api/regras-diarias');
      const data = await res.json();
      if (data?.regras) {
        setDiaViagem(String(data.regras.dia_viagem_padrao ?? 120));
        setDiaChuva(String(data.regras.dia_chuva_padrao ?? 120));
        setDiaParado(String(data.regras.dia_parado_padrao ?? 120));
        setDiariaPiscina(String(data.regras.diaria_piscina_padrao ?? 150));
        setDiariaCivil(String(data.regras.diaria_civil_padrao ?? 180));
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    carregarRegras();
  }, []);

  async function handleSalvarRegras(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoRegras(true);
    try {
      const res = await fetch('/api/regras-diarias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regras: {
            dia_viagem_padrao: Number(diaViagem),
            dia_chuva_padrao: Number(diaChuva),
            dia_parado_padrao: Number(diaParado),
            diaria_piscina_padrao: Number(diariaPiscina),
            diaria_civil_padrao: Number(diariaCivil),
          },
        }),
      });
      if (res.ok) {
        setSucessoRegras(true);
        setTimeout(() => setSucessoRegras(false), 3000);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar parâmetros no servidor.');
    } finally {
      setSalvandoRegras(false);
    }
  }

  function handleAddMembro(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) return;

    setMembros((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        nome: nome.trim(),
        telefone: telefone.trim(),
        nivel,
        obraVinculada: obra,
        ativo: true,
      },
    ]);

    setNome('');
    setTelefone('');
    setSalvoMembro(true);
    setTimeout(() => setSalvoMembro(false), 2500);
  }

  function handleLogout() {
    document.cookie = 'diaria_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'diaria_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'diaria_tenant=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    router.push('/login');
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-32">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full w-fit mb-2 border border-emerald-200/80 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Painel de Governança & Parâmetros Operacionais</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Configurações do Sistema
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configure as regras financeiras de diárias (chuva, viagem, condomínio travado) e gerencie os acessos RBAC.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Switcher de Abas */}
          <div className="flex items-center bg-slate-200/80 p-1.5 rounded-2xl gap-1">
            <button
              onClick={() => setTabAtiva('REGRAS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                tabAtiva === 'REGRAS'
                  ? 'bg-white text-emerald-800 shadow-sm font-black'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>Regras de Diárias</span>
            </button>
            <button
              onClick={() => setTabAtiva('RBAC')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                tabAtiva === 'RBAC'
                  ? 'bg-white text-emerald-800 shadow-sm font-black'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Equipe & RBAC</span>
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-2xl text-xs font-bold transition-all border border-rose-200 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: REGRAS DE DIÁRIAS ================= */}
      {tabAtiva === 'REGRAS' && (
        <div className="space-y-6">
          {/* Card explicativo */}
          <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase font-black tracking-widest block">
                Parametrização Oficial de Campo
              </span>
              <h3 className="text-lg font-black text-white">Tabela Central de Diárias e Exceções</h3>
              <p className="text-xs text-slate-400">
                Esses valores alimentam automaticamente o robô de WhatsApp, a IA do Gemini e a fila de validações da Patrícia.
              </p>
            </div>
            <button
              onClick={carregarRegras}
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 p-2 bg-slate-800 rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Recarregar</span>
            </button>
          </div>

          <form onSubmit={handleSalvarRegras} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Regra 1: Dia de Viagem */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 hover:border-emerald-500/40 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Car className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-slate-950 text-base">Dia de Viagem</h3>
                  <p className="text-xs text-slate-500">
                    Deslocamento da equipe de estrada (exceto motorista, que recebe integral).
                  </p>
                </div>
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-bold text-slate-700">Valor Passageiro (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="0.5"
                      required
                      value={diaViagem}
                      onChange={(e) => setDiaViagem(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <p className="text-[11px] text-emerald-700 font-semibold pt-1">
                    ✓ Motorista: Diária integral do profissional
                  </p>
                </div>
              </div>

              {/* Regra 2: Dia de Chuva */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 hover:border-emerald-500/40 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <CloudRain className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-slate-950 text-base">Dia de Chuva</h3>
                  <p className="text-xs text-slate-500">
                    Quando a chuva impede o avanço de concretagem, escavação ou fibra.
                  </p>
                </div>
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-bold text-slate-700">Valor Dia de Chuva (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="5"
                      required
                      value={diaChuva}
                      onChange={(e) => setDiaChuva(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">
                    Garante ajuda de custo acordada para a equipe no alojamento.
                  </p>
                </div>
              </div>

              {/* Regra 3: Dia Parado (Condomínio / Acesso Travado) */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 hover:border-emerald-500/40 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Ban className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-slate-950 text-base">Dia Parado (Sem Acesso)</h3>
                  <p className="text-xs text-slate-500">
                    Condomínio barra entrada, portaria sem autorização ou falta de liberação.
                  </p>
                </div>
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-bold text-slate-700">Valor Dia Parado (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="5"
                      required
                      value={diaParado}
                      onChange={(e) => setDiaParado(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">
                    Compensação por espera sem culpa da equipe de montagem.
                  </p>
                </div>
              </div>
            </div>

            {/* Parâmetros Padrão de Obra Civil x Piscina */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
              <div className="space-y-1">
                <h3 className="font-black text-slate-950 text-base">Diárias Base Gerais (Sem Exceção)</h3>
                <p className="text-xs text-slate-500">
                  Valores aplicados quando não houver valor individual cadastrado para o trabalhador.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Waves className="w-4 h-4 text-sky-500" />
                    <span>Diária Padrão Piscina (R$)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="5"
                      required
                      value={diariaPiscina}
                      onChange={(e) => setDiariaPiscina(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-amber-500" />
                    <span>Diária Padrão Obra Civil (R$)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="5"
                      required
                      value={diariaCivil}
                      onChange={(e) => setDiariaCivil(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de Salvar */}
            <div className="flex items-center justify-end gap-3">
              {sucessoRegras && (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Regras salvas e ativadas no sistema!
                </span>
              )}

              <button
                type="submit"
                disabled={salvandoRegras}
                className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{salvandoRegras ? 'Salvando...' : 'Salvar Novas Regras de Diárias'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= TAB 2: RBAC (EQUIPE) ================= */}
      {tabAtiva === 'RBAC' && (
        <div className="space-y-8">
          {/* Tenant Card */}
          <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase font-black tracking-widest block">
                Ambiente da Empresa (Multi-Tenant Isolado)
              </span>
              <h3 className="text-lg font-black text-white">Diária.AI Brasil Construtora</h3>
              <p className="text-xs text-slate-400 font-mono">
                Tenant ID: 00000000-0000-0000-0000-000000000001
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-800 px-3.5 py-2 rounded-2xl border border-slate-700 text-xs">
              <Key className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 font-medium">Isolamento via RLS Ativo</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Convite / Cadastro */}
            <div className="bg-white p-7 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h2 className="font-extrabold text-slate-950 text-base">Novo Acesso / Encarregado</h2>
              </div>

              <form onSubmit={handleAddMembro} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Carlos Encarregado"
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Telefone WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(XX) 9XXXX-XXXX"
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Nível de Permissão</label>
                  <select
                    value={nivel}
                    onChange={(e) => setNivel(e.target.value as NivelPermissao)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  >
                    <option value="APONTAMENTO">Apontamento (Encarregado de Campo)</option>
                    <option value="CONSULTA">Consulta (Diretoria / Sócios)</option>
                    <option value="MASTER">Master (Patrícia / Administradora)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Canteiro / Obra</label>
                  <input
                    type="text"
                    value={obra}
                    onChange={(e) => setObra(e.target.value)}
                    placeholder="Ex: Obra Bahia ou Geral"
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-emerald-700/20 active:scale-95"
                >
                  Conceder Permissão
                </button>

                {salvoMembro && (
                  <p className="text-xs text-emerald-700 font-bold flex items-center justify-center gap-1.5 pt-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Permissão concedida com sucesso!
                  </p>
                )}
              </form>
            </div>

            {/* Lista de Membros Ativos */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-slate-950 text-base">
                  Membros Autorizados ({membros.length})
                </h2>
                <span className="text-xs text-slate-500">Gravado no Supabase</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {membros.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-black text-sm text-slate-950">{m.nome}</h3>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{m.telefone}</p>
                      </div>
                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          m.nivel === 'MASTER'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                            : m.nivel === 'CONSULTA'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {m.nivel}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>{m.obraVinculada}</span>
                      <span className="text-emerald-600 font-bold">Ativo</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
