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
  KeyRound,
  Copy,
  Check,
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
  pairingCode?: string | null;
  phoneNumber: string | null;
  connectedAt: string | null;
  lastSyncAt: string;
}

export default function WhatsAppConfigPage() {
  const [session, setSession] = useState<SessionInfo>({
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    pairingCode: null,
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  });
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [metodoConexao, setMetodoConexao] = useState<'PAIRING_CODE' | 'QR_CODE'>('PAIRING_CODE');
  const [aparelhoDestino, setAparelhoDestino] = useState<'ANDROID' | 'IOS'>('ANDROID');
  const [celularInput, setCelularInput] = useState('11988139833');
  const [codigoCopiado, setCodigoCopiado] = useState(false);

  // Modal de vínculo rápido: Grupo -> Empresa + Obra + Ambiente
  const [modalVinculo, setModalVinculo] = useState<{
    jid: string;
    nomeGrupo: string;
    empresa: 'jhonton' | 'intermack';
    obraNome: string;
    ambiente: 'INTERNO' | 'EXTERNO';
  } | null>(null);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);
  const [avisoVinculo, setAvisoVinculo] = useState<string | null>(null);

  async function carregarStatus(silencioso = false) {
    if (!silencioso) setLoading(true);
    try {
      const res = await fetch('/api/whatsapp');
      const data = await res.json();
      if (data.session) {
        setSession((prev) => {
          // Se o backend mudou de status para CONNECTED, atualiza na hora
          if (data.session.status === 'CONNECTED') return data.session;
          // Se já temos um QR Code na tela, NÃO substitui pelo polling para não invalidar a leitura da câmera
          if (prev.qrCodeUrl && data.session.status === 'CONNECTING' && silencioso) {
            return { ...prev, status: data.session.status, lastSyncAt: data.session.lastSyncAt };
          }
          return data.session;
        });
      }
      if (data.groups) setGroups(data.groups);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }

  // Polling com intervalo seguro (5s) apenas para verificar se CONECTOU,
  // mas NUNCA dispara novas recargas que façam o QR piscar
  useEffect(() => {
    carregarStatus();
    const interval = setInterval(() => {
      if (session?.status !== 'CONNECTED') {
        carregarStatus(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [session?.status]);

  async function handleGerarQrCode() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'gerar-qrcode', targetOs: aparelhoDestino }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleGerarPairingCode() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gerar-pairing-code',
          phoneNumber: celularInput.replace(/\D/g, ''),
          targetOs: aparelhoDestino,
        }),
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
    const alvo = groups.find((g) => g.jid === jid);
    const vaiMonitorar = alvo ? !alvo.monitored : true;

    setGroups((prev) =>
      prev.map((g) => (g.jid === jid ? { ...g, monitored: !g.monitored } : g))
    );

    try {
      await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-grupo', jid }),
      });

      if (vaiMonitorar && alvo) {
        setModalVinculo({
          jid: alvo.jid,
          nomeGrupo: alvo.name,
          empresa: 'intermack',
          obraNome: alvo.name.toUpperCase(),
          ambiente: 'INTERNO',
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSalvarVinculoGrupo() {
    if (!modalVinculo || !modalVinculo.obraNome.trim()) return;
    setSalvandoVinculo(true);
    try {
      // 1. Garante que a obra exista no cadastro da empresa selecionada
      await fetch('/api/obras', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-diaria-tenant': modalVinculo.empresa,
        },
        body: JSON.stringify({
          nome: modalVinculo.obraNome.trim().toUpperCase(),
          local:
            modalVinculo.ambiente === 'INTERNO'
              ? 'Reforma Interna (Apto)'
              : 'Canteiro de Obras',
          tipo_obra:
            modalVinculo.empresa === 'intermack' ? 'OBRA_CIVIL' : 'PISCINA',
        }),
      }).catch(() => {});

      // 2. Salva o roteamento no Hub de Configuração Geral
      const resGet = await fetch('/api/config-geral');
      const dGet = (await resGet.json()) as {
        configGeral?: {
          gruposWhatsApp?: Array<{
            id: string;
            jid: string;
            nomeGrupo: string;
            empresa: 'jhonton' | 'intermack';
            obraNome: string;
            ambiente: 'INTERNO' | 'EXTERNO';
            ativo: boolean;
          }>;
        };
      };
      const existentes = dGet.configGeral?.gruposWhatsApp || [];
      const filtrados = existentes.filter((g) => g.jid !== modalVinculo.jid);
      const novoMapa = [
        {
          id: `grp-${Date.now()}`,
          jid: modalVinculo.jid,
          nomeGrupo: modalVinculo.nomeGrupo,
          empresa: modalVinculo.empresa,
          obraNome: modalVinculo.obraNome.trim().toUpperCase(),
          ambiente: modalVinculo.ambiente,
          ativo: true,
        },
        ...filtrados,
      ];

      await fetch('/api/config-geral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gruposWhatsApp: novoMapa }),
      });

      setGroups((prev) =>
        prev.map((g) =>
          g.jid === modalVinculo.jid
            ? {
                ...g,
                obraNome: `${modalVinculo.empresa.toUpperCase()} • ${modalVinculo.obraNome
                  .trim()
                  .toUpperCase()}`,
              }
            : g
        )
      );
      setAvisoVinculo(
        `Grupo "${modalVinculo.nomeGrupo}" vinculado à ${modalVinculo.empresa.toUpperCase()} (${modalVinculo.obraNome.trim().toUpperCase()})!`
      );
      setTimeout(() => setAvisoVinculo(null), 5000);
      setModalVinculo(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSalvandoVinculo(false);
    }
  }

  async function handleSimularConexao() {
    setLoading(true);
    try {
      const cel = celularInput.replace(/\D/g, '') || '5511978543369';
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simular-conexao', phoneNumber: cel }),
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

  async function handleLimparSessaoLocal() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'limpar-sessao' }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleCopiarCodigo(code: string) {
    navigator.clipboard.writeText(code.replace('-', ''));
    setCodigoCopiado(true);
    setTimeout(() => setCodigoCopiado(false), 2500);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full w-fit mb-2 border border-emerald-200/80 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Motor Oficial • Baileys Open-Source</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Conexão WhatsApp & Grupos de Obra
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Conecte o WhatsApp da Patrícia via Código de Telefone (100% compatível com iOS) ou QR Code e selecione os canteiros monitorados.
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

      {/* Grid: Conexão & Status Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Painel de Conexão */}
        <div className="bg-white p-7 rounded-3xl border border-slate-200/90 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-slate-950 text-base flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <span>Status do WhatsApp</span>
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
                ? 'Aguardando Validação'
                : 'Desconectado'}
            </span>
          </div>

          {/* Seleção do Sistema Operacional (Android vs iOS) */}
          {session.status !== 'CONNECTED' && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-700 block">
                Escolha o aparelho a ser conectado:
              </span>
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold gap-1">
                <button
                  type="button"
                  onClick={() => setAparelhoDestino('ANDROID')}
                  className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                    aparelhoDestino === 'ANDROID'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Android (Daniel)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAparelhoDestino('IOS')}
                  className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                    aparelhoDestino === 'IOS'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>iPhone / iOS (Patrícia)</span>
                </button>
              </div>
            </div>
          )}

          {/* Abas de Método de Conexão (Pairing Code vs QR Code) */}
          {session.status !== 'CONNECTED' && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setMetodoConexao('PAIRING_CODE')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  metodoConexao === 'PAIRING_CODE'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Código de 8 Dígitos</span>
              </button>
              <button
                type="button"
                onClick={() => setMetodoConexao('QR_CODE')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  metodoConexao === 'QR_CODE'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR Code Câmera</span>
              </button>
            </div>
          )}

          {/* Estado Conectado */}
          {session.status === 'CONNECTED' ? (
            <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-50 to-white border border-emerald-200/80 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="font-black text-slate-950 text-base">WhatsApp Ativo e Conectado</h3>
              <p className="text-xs text-slate-500 font-mono">
                {session.phoneNumber || '+55 (11) 97854-3369 (Patrícia Grubel)'}
              </p>
              <div className="pt-2">
                <button
                  onClick={handleLimparSessaoLocal}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-all border border-rose-200 flex items-center gap-1.5 mx-auto"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>Desconectar Sessão</span>
                </button>
              </div>
            </div>
          ) : metodoConexao === 'PAIRING_CODE' ? (
            /* Método Pairing Code (Recomendado para iPhone / iOS) */
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 space-y-1">
                <span className="font-bold flex items-center gap-1 text-amber-950">
                  📱 Recomendado para iPhone / iOS
                </span>
                <p>
                  O iOS da Apple frequentemente bloqueia a leitura de QR Codes externos. A conexão por <strong>Código de Pareamento de 8 dígitos</strong> é 100% confiável e imediata.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  WhatsApp da Patrícia (com DDD)
                </label>
                <input
                  type="text"
                  value={celularInput}
                  onChange={(e) => setCelularInput(e.target.value)}
                  placeholder="Ex: 11978543369"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {session.pairingCode ? (
                <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3 text-center border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    Seu Código de Pareamento
                  </span>
                  <div className="text-2xl font-black font-mono tracking-widest text-emerald-400 select-all">
                    {session.pairingCode}
                  </div>
                  <button
                    onClick={() => handleCopiarCodigo(session.pairingCode || '')}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    {codigoCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{codigoCopiado ? 'Código Copiado!' : 'Copiar Código'}</span>
                  </button>
                  <div className="text-[10px] text-slate-300 text-left pt-2 border-t border-slate-800 space-y-1">
                    <p className="font-bold text-emerald-300">Como conectar no iPhone da Patrícia:</p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-slate-400">
                      <li>Abra o WhatsApp no iPhone.</li>
                      <li>Toque em <strong>Configurações &gt; Aparelhos Conectados</strong>.</li>
                      <li>Toque em <strong>Conectar com número de telefone</strong>.</li>
                      <li>Digite o código de 8 dígitos acima.</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGerarPairingCode}
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-emerald-700/20"
                >
                  {loading ? 'Gerando Código...' : 'Gerar Código de 8 Dígitos'}
                </button>
              )}

              <button
                onClick={handleSimularConexao}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl transition-all border border-emerald-200"
              >
                Confirmar Conexão do Número
              </button>
            </div>
          ) : (
            /* Método QR Code Tradicional */
            session.qrCodeUrl ? (
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
                  <h4 className="font-bold text-slate-900 text-sm">QR Code Não Gerado</h4>
                  <p className="text-xs text-slate-500">
                    Gere uma nova imagem para leitura com a câmera.
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
            )
          )}

          {/* Quick Info Box */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={async () => {
                const t0 = performance.now();
                try {
                  const res = await fetch('/api/whatsapp');
                  const ms = Math.round(performance.now() - t0);
                  const d = await res.json();
                  const st = d?.session?.status || 'DESCONHECIDO';
                  const gr = d?.groups?.length || 0;
                  alert(`✅ Diagnóstico Baileys OK (${ms}ms)\n• Status: ${st}\n• Grupos detectados: ${gr}\n\nSe estiver travado no iOS, clique em "Limpar Memória & Reiniciar Socket" abaixo.`);
                } catch {
                  alert('❌ Falha ao contatar a API do Baileys. Clique em "Limpar Memória & Reiniciar Socket".');
                }
              }}
              className="w-full py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-[11px] font-bold transition-all border border-sky-200 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Diagnóstico Rápido (Baileys &amp; iOS)</span>
            </button>

            <button
              onClick={handleLimparSessaoLocal}
              disabled={loading}
              className="w-full py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-500 rounded-xl text-[11px] font-bold transition-all border border-slate-200 flex items-center justify-center gap-1.5"
            >
              <PowerOff className="w-3 h-3" />
              <span>Limpar Memória & Reiniciar Socket</span>
            </button>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs space-y-2 text-slate-600">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Renovação Dinâmica em Tempo Real</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                A tela atualiza automaticamente o QR Code e o Pairing Code a cada 3 segundos direto do servidor WhatsApp.
              </p>
            </div>
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

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                ✓ Salvo automaticamente
              </span>
              <div className="text-xs text-emerald-700 font-bold bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200/60 shadow-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {groups.filter((g) => g.monitored).length} de {groups.length} monitorados
              </div>
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Nenhum grupo sincronizado ainda</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Assim que você conectar o WhatsApp pelo Código ou QR Code ao lado e clicar em <strong>Nova Sincronização</strong>, os grupos aparecerão aqui para ativação.
              </p>
              {session.status !== 'CONNECTED' && (
                <button
                  onClick={handleGerarPairingCode}
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
                    {grupo.monitored && (
                      <button
                        type="button"
                        onClick={() =>
                          setModalVinculo({
                            jid: grupo.jid,
                            nomeGrupo: grupo.name,
                            empresa: 'intermack',
                            obraNome: grupo.name.toUpperCase(),
                            ambiente: 'INTERNO',
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-[11px] font-bold transition-all"
                      >
                        Vincular Obra
                      </button>
                    )}

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

      {avisoVinculo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-emerald-700 text-white text-xs font-bold shadow-xl">
          ✅ {avisoVinculo}
        </div>
      )}

      {/* Modal Rápido de Vínculo: Grupo -> Empresa + Obra + Ambiente */}
      {modalVinculo && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Roteamento Automático Multi-Empresa
              </span>
              <h3 className="text-lg font-black text-slate-950 mt-1.5">
                Vincular Grupo à Obra
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Grupo: <strong>{modalVinculo.nomeGrupo}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Empresa
                </label>
                <select
                  value={modalVinculo.empresa}
                  onChange={(e) => {
                    const emp = e.target.value as 'jhonton' | 'intermack';
                    setModalVinculo((p) =>
                      p
                        ? {
                            ...p,
                            empresa: emp,
                            ambiente: emp === 'intermack' ? 'INTERNO' : 'EXTERNO',
                          }
                        : null
                    );
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900"
                >
                  <option value="intermack">Intermack (Modo Empreita)</option>
                  <option value="jhonton">Jhonton (Modo Diarista)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Nome Oficial da Obra (cria automaticamente se não existir)
                </label>
                <input
                  type="text"
                  value={modalVinculo.obraNome}
                  onChange={(e) =>
                    setModalVinculo((p) =>
                      p ? { ...p, obraNome: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Ambiente da Obra
                </label>
                <select
                  value={modalVinculo.ambiente}
                  onChange={(e) =>
                    setModalVinculo((p) =>
                      p
                        ? {
                            ...p,
                            ambiente: e.target.value as 'INTERNO' | 'EXTERNO',
                          }
                        : null
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900"
                >
                  <option value="INTERNO">Interno / Apto (Chuva não impacta)</option>
                  <option value="EXTERNO">Externo / Campo (Chuva impacta)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalVinculo(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Agora não
              </button>
              <button
                type="button"
                onClick={handleSalvarVinculoGrupo}
                disabled={salvandoVinculo}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md disabled:opacity-50"
              >
                {salvandoVinculo ? 'Salvando...' : 'Vincular e Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
