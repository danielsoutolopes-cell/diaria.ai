'use client';

import React, { useState } from 'react';
import { Layers, Plus, HardHat, UserPlus, CheckCircle, Waves, Building2 } from 'lucide-react';
import { TipoObra } from '@/types/database';

export default function SetupPage() {
  const [obras, setObras] = useState([
    { id: '1', nome: 'Obra Bahia', local: 'Porto Seguro - BA', tipo: 'PISCINA' as TipoObra, funcionarios: 4 },
    { id: '2', nome: 'Jabaquara', local: 'São Paulo - SP', tipo: 'OBRA_CIVIL' as TipoObra, funcionarios: 6 },
    { id: '3', nome: 'Alphaville 02', local: 'Barueri - SP', tipo: 'PISCINA' as TipoObra, funcionarios: 3 },
  ]);

  const [nomeObra, setNomeObra] = useState('');
  const [localObra, setLocalObra] = useState('');
  const [tipoObra, setTipoObra] = useState<TipoObra>('PISCINA');
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
      },
    ]);

    setNomeObra('');
    setLocalObra('');
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full w-fit mb-2">
          <Layers className="w-3.5 h-3.5" />
          <span>Configuração & Tipologia Contratual</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Setup de Obras e Alocação de Equipes
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Cadastre novas obras, defina se o contrato é de Piscina ou Obra Civil e padronize as diárias base.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Cadastrar Obra */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Nova Obra / Canteiro</span>
          </h2>

          <form onSubmit={handleAddObra} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Obra</label>
              <input
                type="text"
                required
                value={nomeObra}
                onChange={(e) => setNomeObra(e.target.value)}
                placeholder="Ex: Obra Bahia, Mansão Tamboré"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Localidade / Cidade</label>
              <input
                type="text"
                value={localObra}
                onChange={(e) => setLocalObra(e.target.value)}
                placeholder="Ex: Ilhéus - BA"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipologia de Contrato</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoObra('PISCINA')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                    tipoObra === 'PISCINA'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Waves className="w-5 h-5 text-sky-500" />
                  <span>Piscina (R$ 150/d)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoObra('OBRA_CIVIL')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                    tipoObra === 'OBRA_CIVIL'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-5 h-5 text-amber-500" />
                  <span>Obra Civil (R$ 180/d)</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-700/20"
            >
              Cadastrar Obra
            </button>

            {salvo && (
              <p className="text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Obra registrada com sucesso!
              </p>
            )}
          </form>
        </div>

        {/* List of Obras */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-bold text-slate-900 text-base">Canteiros em Atividade</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {obras.map((o) => (
              <div
                key={o.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {o.tipo === 'PISCINA' ? (
                      <span className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
                        <Waves className="w-4 h-4" />
                      </span>
                    ) : (
                      <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                        <Building2 className="w-4 h-4" />
                      </span>
                    )}
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {o.tipo}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {o.funcionarios} operários
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-base text-slate-900">{o.nome}</h3>
                  <p className="text-xs text-slate-500">{o.local}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Diária sugerida:</span>
                  <span className="font-bold text-slate-900">
                    {o.tipo === 'PISCINA' ? 'R$ 150,00' : 'R$ 180,00'}
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
