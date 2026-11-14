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

export default function RbacPage() {
  const router = useRouter();
  const [membros, setMembros] = useState<MembroEquipe[]>([
    {
      id: '1',
      nome: 'Patrícia Grubel',
      telefone: '(11) 99876-5432',
      nivel: 'MASTER',
      obraVinculada: 'Todas as Obras',
      ativo: true,
    },
    {
      id: '2',
      nome: 'Carlos Encarregado',
      telefone: '(73) 98123-4567',
      nivel: 'APONTAMENTO',
      obraVinculada: 'Obra Bahia (Piscina)',
      ativo: true,
    },
    {
      id: '3',
      nome: 'Fábio Mestre de Obras',
      telefone: '(11) 97654-3210',
      nivel: 'APONTAMENTO',
      obraVinculada: 'Jabaquara',
      ativo: true,
    },
  ]);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nivel, setNivel] = useState<NivelPermissao>('APONTAMENTO');
  const [obra, setObra] = useState('Geral');
  const [salvo, setSalvo] = useState(false);

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
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
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
            <span>Controle de Permissões • Multi-Tenant RBAC</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Configurações de Acesso & Equipe
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Gerencie quem tem autorização para enviar apontamentos de obras, consultar diárias ou aprovar fechamentos financeiros.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-2xl text-xs font-bold transition-all border border-rose-200 flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Encerrar Sessão</span>
        </button>
      </div>

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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Celular com WhatsApp</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Nível de Permissão (RBAC)</label>
              <select
                value={nivel}
                onChange={(e) => setNivel(e.target.value as NivelPermissao)}
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all cursor-pointer"
              >
                <option value="APONTAMENTO">APONTAMENTO (Envia mensagens de ponto no WhatsApp)</option>
                <option value="CONSULTA">CONSULTA (Apenas visualiza relatórios e extratos)</option>
                <option value="MASTER">MASTER / ADMIN (Acesso total e aprovações)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Canteiro Vinculado</label>
              <input
                type="text"
                value={obra}
                onChange={(e) => setObra(e.target.value)}
                placeholder="Ex: Obra Bahia, Jabaquara ou Geral"
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-emerald-700/20 active:scale-95"
            >
              Conceder Acesso
            </button>

            {salvo && (
              <p className="text-xs text-emerald-700 font-bold flex items-center justify-center gap-1.5 pt-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Acesso registrado com sucesso!
              </p>
            )}
          </form>
        </div>

        {/* List of Members */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-slate-950 text-base">
              Usuários e Níveis Autorizados ({membros.length})
            </h2>
            <span className="text-xs text-slate-500">Hierarquia RBAC</span>
          </div>

          <div className="space-y-3">
            {membros.map((m) => (
              <div
                key={m.id}
                className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-950 text-base">{m.nome}</span>
                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        m.nivel === 'MASTER'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : m.nivel === 'APONTAMENTO'
                          ? 'bg-sky-50 text-sky-800 border border-sky-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {m.nivel}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {m.telefone}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <HardHat className="w-3.5 h-3.5 text-slate-400" />
                      {m.obraVinculada}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                    Ativo
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
