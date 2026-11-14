'use client';

import React, { useState } from 'react';
import { Layers, Plus, HardHat, CheckCircle, Waves, Building2, MapPin, Users, Sparkles } from 'lucide-react';
import { TipoObra } from '@/types/database';

export default function SetupPage() {
  const [obras, setObras] = useState([
    { id: '1', nome: 'Obra Bahia', local: 'Porto Seguro - BA', tipo: 'PISCINA' as TipoObra, funcionarios: 4, diaria: 150 },
    { id: '2', nome: 'Jabaquara', local: 'São Paulo - SP', tipo: 'OBRA_CIVIL' as TipoObra, funcionarios: 6, diaria: 180 },
    { id: '3', nome: 'Alphaville 02', local: 'Barueri - SP', tipo: 'PISCINA' as TipoObra, funcionarios: 3, diaria: 150 },
    { id: '4', nome: 'Barra da Tijuca', local: 'Rio de Janeiro - RJ', tipo: 'PISCINA' as TipoObra, funcionarios: 5, diaria: 160 },
  ]);

  const [nomeObra, setNomeObra] = useState('');
  const [localObra, setLocalObra] = useState('');
  const [tipoObra, setTipoObra] = useState<TipoObra>('PISCINA');
  const [diariaPersonalizada, setDiariaPersonalizada] = useState(150);
  const [salvo, setSalvo] = useState(false);

  function handleAddObra(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeObra.trim()) return;

    setObras((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        nome: nomeObra.trim(),
        local: localObra.trim() || 'Canteiro Central',
        tipo: tipoObra,
        funcionarios: 0,
        diaria: diariaPersonalizada,
      },
    ]);

    setNomeObra('');
    setLocalObra('');
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="pb-2 border-b border-slate-200/80">
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
                  onClick={() => {
                    setTipoObra('PISCINA');
                    setDiariaPersonalizada(150);
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
                    setDiariaPersonalizada(180);
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

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Diária Base Sugerida (R$)</label>
              <input
                type="number"
                value={diariaPersonalizada}
                onChange={(e) => setDiariaPersonalizada(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-emerald-700/20 active:scale-95"
            >
              Adicionar Obra ao Sistema
            </button>

            {salvo && (
              <p className="text-xs text-emerald-700 font-bold flex items-center justify-center gap-1.5 pt-1">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Obra configurada com sucesso!
              </p>
            )}
          </form>
        </div>

        {/* List of Obras */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-slate-950 text-base">Canteiros Ativos ({obras.length})</h2>
            <span className="text-xs text-slate-500">Tabela de Diárias em Vigor</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {obras.map((o) => (
              <div
                key={o.id}
                className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {o.tipo === 'PISCINA' ? (
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
                        o.tipo === 'PISCINA'
                          ? 'bg-sky-50 text-sky-800 border border-sky-200/60'
                          : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                      }`}
                    >
                      {o.tipo === 'PISCINA' ? 'Piscina' : 'Obra Civil'}
                    </span>
                  </div>

                  <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {o.funcionarios} operários
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
                    R$ {o.diaria.toFixed(2)}
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
