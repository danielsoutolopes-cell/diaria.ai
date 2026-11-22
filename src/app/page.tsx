'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarCheck2,
  DollarSign,
  HardHat,
  Users,
  Clock,
  CloudSun,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  QrCode,
} from 'lucide-react';
import TerminalIA from '@/components/TerminalIA';
import OnboardingChecklist from '@/components/OnboardingChecklist';

interface DashboardMetrics {
  obrasAtivas: number;
  obrasLista: Array<{ id: string; nome: string }>;
  lotesPendentes: number;
  totalOperarios: number;
  totalVales: number;
  saldoLiquidoSemana: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    obrasAtivas: 0,
    obrasLista: [],
    lotesPendentes: 0,
    totalOperarios: 0,
    totalVales: 0,
    saldoLiquidoSemana: 0,
  });
  const [loading, setLoading] = useState(true);
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');

  useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const raw = userCookie.split('=')[1] || '';
      try {
        setUsuarioAtual(decodeURIComponent(decodeURIComponent(raw)).trim());
      } catch {
        setUsuarioAtual(decodeURIComponent(raw).replace(/%20/g, ' ').trim());
      }
    }
    async function carregarMetricas() {
      try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        setMetrics(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    carregarMetricas();
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-8">
      {/* Top Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Ambiente Executivo VIP
            </span>
            <span className="text-[11px] sm:text-xs text-slate-500 font-medium capitalize">
              •{' '}
              {new Date().toLocaleDateString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              })}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-950 tracking-tight">
            {usuarioAtual.toLowerCase().includes('daniel')
              ? 'Olá, Daniel 🚀'
              : `Olá, ${usuarioAtual.split(' ')[0] || 'Patrícia'} ✨`}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">
            {usuarioAtual.toLowerCase().includes('daniel')
              ? 'Painel de Diretoria & Operações Multi-Empresa pronto. Acompanhe obras, efetivo, validações e medições em tempo real.'
              : 'Seu centro de comando financeiro e de pessoal está pronto. Nenhuma diária é liquidada sem seu aval direto.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2.5 w-full md:w-auto">
          <Link
            href="/validacao/diarias"
            className="px-4 sm:px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-emerald-700/25 flex items-center justify-center gap-2.5 active:scale-95 order-1 sm:order-2"
          >
            <CalendarCheck2 className="w-4 h-4 shrink-0" />
            <span>Fila de Aprovação ({metrics.lotesPendentes})</span>
          </Link>
          <Link
            href="/whatsapp"
            className="px-4 sm:px-5 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 order-2 sm:order-1"
          >
            <QrCode className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Conectar WhatsApp</span>
          </Link>
        </div>
      </div>

      {/* Checklist Acionável de Primeiros Passos (Recolhível) */}
      <OnboardingChecklist />

      {/* Hero: O 'Cofre Executivo' da Patrícia */}
      <div className="luxury-card-gradient rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-20 w-60 h-60 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-8">
          <div className="space-y-2.5 sm:space-y-3">
            <div className="flex items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Posição Consolidada da Semana</span>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium block">Total Líquido Validado a Pagar</span>
              <div className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white flex flex-wrap items-baseline gap-2 tabular-nums">
                <span>R$ {metrics.saldoLiquidoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[11px] sm:text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800/60">
                  {metrics.obrasAtivas} {metrics.obrasAtivas === 1 ? 'Canteiro' : 'Canteiros'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
              {metrics.totalVales > 0
                ? `O valor acima já deduz R$ ${metrics.totalVales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em adiantamentos de vales distribuídos nas obras.`
                : 'Nenhum vale lançado ou saldo pendente no momento. Os lançamentos reais alimentarão este painel.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 shrink-0">
            <div className="bg-slate-900/80 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-slate-700/60 space-y-1">
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Vales Deduzidos</div>
              <div className="text-base sm:text-xl font-black text-rose-400 tabular-nums">
                - R$ {metrics.totalVales.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-400">Proteção ativa</div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-slate-700/60 space-y-1">
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <CloudSun className="w-3.5 h-3.5 text-sky-400 shrink-0" /> Clima
              </div>
              <div className="text-base sm:text-xl font-black text-sky-300">Tempo Aberto</div>
              <div className="text-[10px] text-slate-400">OpenWeather ativo</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Row (2x2 compacto no celular em pé) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-2 sm:space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Pendências</span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-amber-50 text-amber-600 shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums">{metrics.lotesPendentes} Lotes</div>
            <div className="text-[11px] sm:text-xs text-amber-600 font-semibold mt-0.5 leading-snug">
              {metrics.lotesPendentes > 0 ? 'Aguardando aprovação' : 'Fila zerada'}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-2 sm:space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Canteiros</span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <HardHat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums">{metrics.obrasAtivas} Obras</div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
              {metrics.obrasLista.length > 0 ? metrics.obrasLista.map((o) => o.nome).join(', ') : 'Cadastre em Setup'}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-2 sm:space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Equipe</span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-sky-50 text-sky-600 shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums">{metrics.totalOperarios} Operários</div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 leading-snug">Com PIX e cadastro</div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-2 sm:space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Caixa</span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-black text-emerald-700">100% Blindado</div>
            <div className="text-[11px] sm:text-xs text-emerald-600 font-semibold mt-0.5 leading-snug">Aval humano obrigatório</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Terminal IA + Quick Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                Terminal Omnichannel & IA
              </h2>
              <p className="text-xs text-slate-500">
                Converse com o Gemini ou veja o processamento das mensagens do WhatsApp
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shrink-0">
              Online
            </span>
          </div>

          <TerminalIA />
        </div>

        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Atalhos Imediatos</span>
            </div>

            <div className="space-y-2.5">
              <Link
                href="/whatsapp"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-200 transition-all text-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-slate-900 font-bold block text-xs">Conexão WhatsApp</span>
                    <span className="text-[11px] text-slate-500">QR Code e grupos monitorados</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
              </Link>

              <Link
                href="/validacoes"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-200 transition-all text-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center font-bold text-xs">
                    {metrics.lotesPendentes}
                  </div>
                  <div>
                    <span className="text-slate-900 font-bold block text-xs">Revisar Pontos do Dia</span>
                    <span className="text-[11px] text-slate-500">Ajuste frações 1.0, 0.5 ou 0</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
              </Link>

              <Link
                href="/bordero"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-200 transition-all text-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    PIX
                  </div>
                  <div>
                    <span className="text-slate-900 font-bold block text-xs">Borderô da Semana</span>
                    <span className="text-[11px] text-slate-500">Liquidação com PIX dinâmico</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
              </Link>

              <Link
                href="/setup"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-200 transition-all text-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-100/80 text-sky-700 flex items-center justify-center font-bold text-xs">
                    +
                  </div>
                  <div>
                    <span className="text-slate-900 font-bold block text-xs">Setup de Canteiros</span>
                    <span className="text-[11px] text-slate-500">Cadastre Piscinas e Obras Civis</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
