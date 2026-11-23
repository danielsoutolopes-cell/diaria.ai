'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  MessageSquare,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Lock,
  Smartphone,
  CloudRain,
  Home,
} from 'lucide-react';
import { isDanielOuPatricia } from '@/lib/tenant';
import FeatureFlagsHomologacaoPanel from '@/components/FeatureFlagsHomologacaoPanel';

interface GrupoWhatsAppMapeado {
  id: string;
  jid: string;
  nomeGrupo: string;
  empresa: 'jhoston' | 'intermack';
  obraNome: string;
  ambiente: 'INTERNO' | 'EXTERNO';
  ativo: boolean;
}

interface ConfigGeralGlobal {
  telefonePatricia: string;
  telefoneDaniel: string;
  nomeExibicaoJhoston: string;
  nomeExibicaoIntermack: string;
  instanciaWhatsAppUrl: string;
  gruposWhatsApp: GrupoWhatsAppMapeado[];
}

export default function ConfigGeralPage() {
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [autorizado, setAutorizado] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [salvoComSucesso, setSalvoComSucesso] = useState<boolean>(false);

  const [config, setConfig] = useState<ConfigGeralGlobal>({
    telefonePatricia: '5511978543369',
    telefoneDaniel: '5511988139833',
    nomeExibicaoJhoston: 'Jhoston Construções e Revestimentos',
    nomeExibicaoIntermack: 'Intermack Engenharia e Construção',
    instanciaWhatsAppUrl: 'https://diaria-ai.onrender.com',
    gruposWhatsApp: [],
  });

  // Novo grupo WhatsApp
  const [novoJid, setNovoJid] = useState('');
  const [novoNomeGrupo, setNovoNomeGrupo] = useState('');
  const [novaEmpresa, setNovaEmpresa] = useState<'jhoston' | 'intermack'>('intermack');
  const [novaObra, setNovaObra] = useState('');
  const [novoAmbiente, setNovoAmbiente] = useState<'INTERNO' | 'EXTERNO'>('INTERNO');
  const [gruposBaileys, setGruposBaileys] = useState<
    Array<{ jid: string; name: string }>
  >([]);
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);

  async function handleCarregarGruposWhatsApp() {
    setCarregandoGrupos(true);
    try {
      const res = await fetch('/api/whatsapp');
      const data = (await res.json()) as {
        groups?: Array<{ jid: string; name: string }>;
      };
      setGruposBaileys(data.groups || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCarregandoGrupos(false);
    }
  }

  useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    const nome = userCookie
      ? decodeURIComponent(userCookie.split('=')[1])
      : 'Patrícia Grubel';
    setUsuarioAtual(nome);
    const ok = isDanielOuPatricia(nome);
    setAutorizado(ok);

    if (ok) {
      fetch('/api/config-geral')
        .then((res) => res.json())
        .then((d: { configGeral?: ConfigGeralGlobal }) => {
          if (d.configGeral) setConfig(d.configGeral);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  function handleAdicionarGrupo() {
    if (!novoJid.trim() || !novaObra.trim()) return;
    const item: GrupoWhatsAppMapeado = {
      id: `grp-${Date.now()}`,
      jid: novoJid.trim(),
      nomeGrupo: novoNomeGrupo.trim() || novaObra.trim(),
      empresa: novaEmpresa,
      obraNome: novaObra.trim().toUpperCase(),
      ambiente: novoAmbiente,
      ativo: true,
    };
    setConfig((prev) => ({
      ...prev,
      gruposWhatsApp: [item, ...prev.gruposWhatsApp],
    }));
    setNovoJid('');
    setNovoNomeGrupo('');
    setNovaObra('');
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const res = await fetch('/api/config-geral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSalvoComSucesso(true);
        setTimeout(() => setSalvoComSucesso(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSalvando(false);
    }
  }

  if (!autorizado) {
    return (
      <div className="p-10 max-w-xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-slate-950">Acesso Restrito</h1>
        <p className="text-sm text-slate-600">
          A Configuração Geral Multi-Empresa é exclusiva para <strong>Patrícia Grubel</strong> e <strong>Daniel Lopes</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-800 bg-indigo-50 px-3 py-1 rounded-full w-fit mb-2 border border-indigo-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Exclusivo Patrícia & Daniel • Hub Multi-Empresa</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Configuração Geral (Jhoston & Intermack)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Ponto único para chaves de liberação (Feature Flags) em homologação/implantação, dados compartilhados e roteamento de grupos do WhatsApp.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando || loading}
          className="px-6 py-3 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-md transition-all active:scale-95"
        >
          {salvoComSucesso ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Salvo com Sucesso!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{salvando ? 'Salvando...' : 'Salvar Configurações'}</span>
            </>
          )}
        </button>
      </div>

      {/* Central Única de Homologação & Implantação (Feature Flags por Empresa) */}
      <FeatureFlagsHomologacaoPanel usuarioAtual={usuarioAtual} />

      {/* Dados Básicos Compartilhados */}
      <section className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Building2 className="w-4 h-4 text-indigo-600" />
          <span>Dados Básicos Compartilhados ({usuarioAtual})</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Nome Timbrado — Jhoston
            </label>
            <input
              type="text"
              value={config.nomeExibicaoJhoston}
              onChange={(e) =>
                setConfig((p) => ({ ...p, nomeExibicaoJhoston: e.target.value }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Nome Timbrado — Intermack
            </label>
            <input
              type="text"
              value={config.nomeExibicaoIntermack}
              onChange={(e) =>
                setConfig((p) => ({ ...p, nomeExibicaoIntermack: e.target.value }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              WhatsApp Patrícia Grubel (Alertas)
            </label>
            <input
              type="text"
              value={config.telefonePatricia}
              onChange={(e) =>
                setConfig((p) => ({ ...p, telefonePatricia: e.target.value }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              WhatsApp Daniel Lopes (Alertas)
            </label>
            <input
              type="text"
              value={config.telefoneDaniel}
              onChange={(e) =>
                setConfig((p) => ({ ...p, telefoneDaniel: e.target.value }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold"
            />
          </div>
        </div>
      </section>

      {/* Roteamento de Grupos WhatsApp (1 conta -> N obras/empresas) */}
      <section className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>Roteamento de Grupos do WhatsApp (1 Conta → Cada Obra = 1 Grupo)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCarregarGruposWhatsApp}
              disabled={carregandoGrupos}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold transition-all"
            >
              {carregandoGrupos ? 'Buscando grupos...' : 'Puxar Grupos do WhatsApp'}
            </button>
            <span className="text-[11px] font-bold text-slate-500">
              {config.gruposWhatsApp.length} grupo(s) mapeado(s)
            </span>
          </div>
        </div>

        {/* Lista rápida de grupos puxados do WhatsApp */}
        {gruposBaileys.length > 0 && (
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
            <span className="text-[11px] font-black text-emerald-900 block">
              Clique em um grupo conectado para preencher o JID automaticamente:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {gruposBaileys.map((g) => (
                <button
                  key={g.jid}
                  type="button"
                  onClick={() => {
                    setNovoJid(g.jid);
                    setNovoNomeGrupo(g.name);
                    if (!novaObra) setNovaObra(g.name);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold text-slate-800"
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form para adicionar novo grupo */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            placeholder="JID do Grupo (ex: 120363...@g.us)"
            value={novoJid}
            onChange={(e) => setNovoJid(e.target.value)}
            className="sm:col-span-4 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
          />
          <input
            type="text"
            placeholder="Nome da Obra (ex: Apto Jardins)"
            value={novaObra}
            onChange={(e) => setNovaObra(e.target.value)}
            className="sm:col-span-3 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
          />
          <select
            value={novaEmpresa}
            onChange={(e) => {
              const emp = e.target.value as 'jhoston' | 'intermack';
              setNovaEmpresa(emp);
              setNovoAmbiente(emp === 'intermack' ? 'INTERNO' : 'EXTERNO');
            }}
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold"
          >
            <option value="intermack">Intermack</option>
            <option value="jhoston">Jhoston</option>
          </select>
          <select
            value={novoAmbiente}
            onChange={(e) =>
              setNovoAmbiente(e.target.value as 'INTERNO' | 'EXTERNO')
            }
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold"
          >
            <option value="INTERNO">Interno (Apto)</option>
            <option value="EXTERNO">Externo (Campo)</option>
          </select>
          <button
            type="button"
            onClick={handleAdicionarGrupo}
            className="sm:col-span-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center"
            title="Adicionar vínculo"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de grupos mapeados */}
        {config.gruposWhatsApp.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">
            Nenhum grupo vinculado ainda. Adicione os 2 grupos das obras da Intermack acima e clique em <strong>Salvar Configurações</strong>.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden">
            {config.gruposWhatsApp.map((g) => (
              <div
                key={g.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        g.empresa === 'intermack'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {g.empresa}
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {g.obraNome}
                    </span>
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                      {g.ambiente === 'INTERNO' ? (
                        <>
                          <Home className="w-3 h-3 text-indigo-500" />
                          Interno (Sem Chuva)
                        </>
                      ) : (
                        <>
                          <CloudRain className="w-3 h-3 text-sky-500" />
                          Externo (Chuva Impacta)
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400">{g.jid}</p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      gruposWhatsApp: prev.gruposWhatsApp.filter(
                        (item) => item.id !== g.id
                      ),
                    }))
                  }
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 self-end sm:self-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
