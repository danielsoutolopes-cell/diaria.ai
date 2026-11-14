'use client';

import React, { useState, useEffect } from 'react';
import { Layers, Plus, HardHat, CheckCircle, Waves, Building2, MapPin, Users, Sparkles, RefreshCw } from 'lucide-react';
import { TipoObra } from '@/types/database';
import { supabase } from '@/lib/supabase';

interface ObraItem {
  id: string;
  nome: string;
  local: string;
  tipo_obra: TipoObra;
  ativo: boolean;
}

export default function SetupPage() {
  const [obras, setObras] = useState<ObraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cadastrando, setCadastrando] = useState(false);

  const [nomeObra, setNomeObra] = useState('');
  const [localObra, setLocalObra] = useState('');
  const [tipoObra, setTipoObra] = useState<TipoObra>('PISCINA');
  const [salvo, setSalvo] = useState(false);

  async function carregarObras() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('obras_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setObras(data as ObraItem[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarObras();
  }, []);

  async function handleAddObra(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeObra.trim()) return;

    setCadastrando(true);
    try {
      const { data, error } = await supabase
        .from('obras_config')
        .insert({
          tenant_id: '00000000-0000-0000-0000-000000000001',
          nome: nomeObra.trim().toUpperCase(),
          local: localObra.trim() || 'Canteiro Volante',
          tipo_obra: tipoObra,
        })
        .select()
        .single();

      if (data) {
        setObras((prev) => [data as ObraItem, ...prev]);
        setNomeObra('');
        setLocalObra('');
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCadastrando(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-sky-800 bg-sky-50 px-3 py-1 rounded-full w-fit mb-2 border border-sky-200/80 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span>Gestão Central de Canteiros & Tipologias</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Setup de Obras & Equipes
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cadastre novos canteiros, selecione o padrão contratual (Piscina ou Obra Civil) e configure a tabela de diárias.
          </p>
        </div>

        <button
          onClick={carregarObras}
          disabled={loading}
          className="p-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl transition-all shadow-sm"
          title="Atualizar lista"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Cadastrar Obra */}
        <div className="bg-white p-7 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <h2 className="font-extrabold text-slate-950 text-base">Nova Obra / Canteiro</h2>
          </div>

          <form onSubmit={handleAddObra} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Nome do Canteiro</label>
              <input
                type="text"
                required
                value={nomeObra}
                onChange={(e) => setNomeObra(e.target.value)}
                placeholder="Ex: Mansão Tamboré, Obra Bahia"
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Cidade / Localização</label>
              <input
                type="text"
                value={localObra}
                onChange={(e) => setLocalObra(e.target.value)}
                placeholder="Ex: Barueri - SP"
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Tipologia de Obra</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTipoObra('PISCINA')}
                  className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                    tipoObra === 'PISCINA'
                      ? 'border-sky-500 bg-sky-50/80 text-sky-900 shadow-sm ring-2 ring-sky-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Waves className="w-5 h-5 text-sky-500" />
                  <span>Piscina (R$ 150)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoObra('OBRA_CIVIL')}
                  className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                    tipoObra === 'OBRA_CIVIL'
                      ? 'border-amber-500 bg-amber-50/80 text-amber-900 shadow-sm ring-2 ring-amber-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-5 h-5 text-amber-500" />
                  <span>Obra Civil (R$ 180)</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={cadastrando}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-emerald-700/20 active:scale-95 disabled:opacity-50"
            >
              {cadastrando ? 'Salvando no Banco...' : 'Adicionar Obra ao Sistema'}
            </button>

            {salvo && (
              <p className="text-xs text-emerald-700 font-bold flex items-center justify-center gap-1.5 pt-1">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Obra registrada com sucesso!
              </p>
            )}
          </form>
        </div>

        {/* List of Obras */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-slate-950 text-base">Canteiros Ativos ({obras.length})</h2>
            <span className="text-xs text-slate-500">Gravado no Supabase</span>
          </div>

          {loading ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-sm text-slate-500">Carregando canteiros do banco...</p>
            </div>
          ) : obras.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <HardHat className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Nenhum canteiro cadastrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Use o formulário ao lado para cadastrar a primeira obra ou deixe que o WhatsApp Bot crie automaticamente ao receber mensagens de campo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {obras.map((o) => (
                <div
                  key={o.id}
                  className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-4"
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

                    <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                      Ativa
                    </span>
                  </div>

                  <div>
                    <h3 className="font-black text-lg text-slate-950">{o.nome}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{o.local}</span>
                    </div>
                  </div>

                  <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Diária Padrão:</span>
                    <span className="font-black text-slate-950 text-sm">
                      {o.tipo_obra === 'PISCINA' ? 'R$ 150,00' : 'R$ 180,00'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
