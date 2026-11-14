'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  QrCode,
  RefreshCw,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Users,
  ShieldCheck,
  PowerOff,
  Sparkles,
  ArrowRight,
  HardHat,
} from 'lucide-react';

interface GroupItem {
  id: string;
  jid: string;
  name: string;
  memberCount: number;
  monitored: boolean;
  obraNome?: string;
}

interface SessionInfo {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
  qrCodeUrl: string | null;
  phoneNumber: string | null;
  connectedAt: string | null;
  lastSyncAt: string;
}

export default function WhatsAppConfigPage() {
  const [session, setSession] = useState<SessionInfo>({
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  });
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function carregarStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp');
      const data = await res.json();
      if (data.session) setSession(data.session);
      if (data.groups) setGroups(data.groups);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarStatus();
  }, []);

  async function handleGerarQrCode() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'gerar-qrcode' }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSincronizar() {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sincronizar' }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
      if (data.groups) setGroups(data.groups);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleGrupo(jid: string) {
    // Atualização otimista
    setGroups((prev) =>
      prev.map((g) => (g.jid === jid ? { ...g, monitored: !g.monitored } : g))
    );

    try {
      await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-grupo', jid }),
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSimularConexao() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simular-conexao', phoneNumber: '5511998765432' }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
      if (data.groups) setGroups(data.groups);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDesconectar() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'desconectar' }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full w-fit mb-2 border border-emerald-200/80 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Integração de Mensageria • Baileys & Evolution API</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Conexão WhatsApp & Grupos de Obra
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Emparelhe o número oficial do bot via QR Code e selecione quais grupos de obra a IA deve monitorar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSincronizar}
            disabled={syncing || loading}
            className="px-5 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-600 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Sincronizando...' : 'Nova Sincronização'}</span>
          </button>
        </div>
      </div>

      {/* Grid: QR Code & Status Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: QR Code & Session State */}
        <div className="bg-white p-7 rounded-3xl border border-slate-200/90 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-slate-950 text-base flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <span>Status do Dispositivo</span>
            </h2>

            <span
              className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                session.status === 'CONNECTED'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : session.status === 'CONNECTING'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {session.status === 'CONNECTED'
                ? 'Conectado'
                : session.status === 'CONNECTING'
                ? 'Aguardando Leitura'
                : 'Desconectado'}
            </span>
          </div>

          {/* QR Code Container */}
          {session.status === 'CONNECTED' ? (
            <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-50 to-white border border-emerald-200/80 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="font-black text-slate-950 text-base">WhatsApp Ativo e Conectado</h3>
              <p className="text-xs text-slate-500 font-mono">
                {session.phoneNumber || '+55 (11) 99876-5432'}
              </p>
              <div className="pt-2">
                <button
                  onClick={handleDesconectar}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-all border border-rose-200 flex items-center gap-1.5 mx-auto"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>Desconectar Sessão</span>
                </button>
              </div>
            </div>
          ) : session.qrCodeUrl ? (
            <div className="space-y-4 text-center">
              <div className="p-3 bg-white border-2 border-dashed border-emerald-300 rounded-3xl inline-block shadow-md">
                <img
                  src={session.qrCodeUrl}
                  alt="QR Code WhatsApp"
                  className="w-56 h-56 mx-auto rounded-2xl"
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-900">
                  Aponte a câmera do WhatsApp para conectar
                </p>
                <p className="text-[11px] text-slate-400">
                  No celular: Configurações &gt; Aparelhos Conectados &gt; Conectar um Aparelho
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleSincronizar}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Atualizar QR Code</span>
                </button>

                <button
                  onClick={handleSimularConexao}
                  className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl transition-all border border-emerald-200"
                >
                  Simular Leitura do QR Code
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
              <div className="w-12 h-12 bg-slate-200 text-slate-600 rounded-2xl flex items-center justify-center mx-auto">
                <QrCode className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">Nenhuma sessão ativa</h4>
                <p className="text-xs text-slate-500">
                  Gere um QR Code para conectar o WhatsApp oficial ao motor de IA.
                </p>
              </div>

              <button
                onClick={handleGerarQrCode}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-emerald-700/20"
              >
                {loading ? 'Gerando...' : 'Gerar QR Code de Conexão'}
              </button>
            </div>
          )}

          {/* Quick Info Box */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs space-y-2 text-slate-600">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Trava Anti-Duplicação (Mutex)</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Mensagens reenviadas ou simultâneas nos grupos são descartadas automaticamente pelo servidor para evitar diárias repetidas.
            </p>
          </div>
        </div>

        {/* Right Column: Grupos Descobertos & Monitoramento */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-slate-950 text-base">
                Grupos do WhatsApp Detectados ({groups.length})
              </h2>
              <p className="text-xs text-slate-500">
                Ative a chave de monitoramento para cada canteiro que a IA deve acompanhar.
              </p>
            </div>

            <div className="text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200/60">
              {groups.filter((g) => g.monitored).length} grupos monitorados
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Nenhum grupo sincronizado ainda</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Assim que você conectar o WhatsApp pelo QR Code ao lado e clicar em <strong>Nova Sincronização</strong>, os grupos da empresa aparecerão aqui para seleção.
              </p>
              {session.status !== 'CONNECTED' && (
                <button
                  onClick={handleGerarQrCode}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all"
                >
                  Conectar Aparelho Agora
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((grupo) => (
                <div
                  key={grupo.jid}
                  className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-950 text-base">{grupo.name}</span>
                      {grupo.obraNome && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {grupo.obraNome}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <span>ID: {grupo.jid}</span>
                      {grupo.memberCount > 0 && (
                        <>
                          <span>•</span>
                          <span>{grupo.memberCount} membros</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span
                      className={`text-xs font-bold ${
                        grupo.monitored ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {grupo.monitored ? 'Monitorando IA' : 'Ignorado'}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleToggleGrupo(grupo.jid)}
                      aria-label={`Alternar monitoramento do grupo ${grupo.name}`}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        grupo.monitored ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          grupo.monitored ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
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

