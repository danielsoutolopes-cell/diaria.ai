import React from 'react';
import Link from 'next/link';
import {
  CalendarCheck2,
  DollarSign,
  HardHat,
  Users,
  ArrowUpRight,
  Clock,
  CloudSun,
  ShieldCheck,
} from 'lucide-react';
import TerminalIA from '@/components/TerminalIA';

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Canteiros Volantes
            </span>
            <span className="text-xs text-slate-500">• Filosofia Human-in-the-Loop</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Painel de Operações & Caixa
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Gestão de diárias, apontamentos de campo e borderô semanal das obras.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/validacoes"
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-700/20 flex items-center gap-2"
          >
            <CalendarCheck2 className="w-4 h-4" />
            <span>Ver Fila Pendente</span>
          </Link>
          <Link
            href="/bordero"
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>Borderô Semanal</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Validações Pendentes</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">3 Lotes</div>
          <div className="text-xs text-amber-600 font-medium">Aguardando revisão de Patrícia</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Obras Ativas</span>
            <HardHat className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">4 Canteiros</div>
          <div className="text-xs text-slate-500">Bahia, Jabaquara, Alphaville, Barra</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total em Vales (Semana)</span>
            <DollarSign className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">R$ 1.850,00</div>
          <div className="text-xs text-rose-600 font-medium">Descontos a aplicar na sexta</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Clima & Chuva (Prevenção)</span>
            <CloudSun className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">Chuva 40%</div>
          <div className="text-xs text-sky-600 font-medium">OpenWeather API Conectado</div>
        </div>
      </div>

      {/* Main Grid: Terminal IA + Quick Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Terminal Omnichannel (WhatsApp / IA)</h2>
            <span className="text-xs text-slate-500">Processamento em Tempo Real</span>
          </div>
          <TerminalIA />
        </div>

        <div className="space-y-6">
          {/* Quick Guide Card */}
          <div className="bg-emerald-950 text-white p-6 rounded-2xl shadow-sm border border-emerald-900 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Regra de Ouro do Caixa</span>
            </div>
            <h3 className="text-lg font-bold">Blindagem Financeira</h3>
            <p className="text-xs text-emerald-200 leading-relaxed">
              Nenhuma diária é liquidada automaticamente pela IA. Todas as mensagens informais dos mestres ficam com status <strong>PENDENTE</strong> até que você confira e aprove na tela de Validação.
            </p>
            <div className="pt-2 border-t border-emerald-800/80 flex items-center justify-between text-xs">
              <span className="text-emerald-300">WhatsApp Privado</span>
              <span className="text-white font-semibold">Notificações Ativas</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Ações Imediatas</h3>
            <div className="space-y-2">
              <Link
                href="/validacoes"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-sm group"
              >
                <span className="text-slate-700 font-medium">Validar Apontamentos do Dia</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </Link>
              <Link
                href="/setup"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-sm group"
              >
                <span className="text-slate-700 font-medium">Cadastrar Obra ou Equipe</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </Link>
              <Link
                href="/bordero"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-sm group"
              >
                <span className="text-slate-700 font-medium">Calcular e Copiar PIX da Folha</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
