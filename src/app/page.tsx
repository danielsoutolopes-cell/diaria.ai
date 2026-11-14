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
  Sparkles,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import TerminalIA from '@/components/TerminalIA';

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Ambiente Executivo VIP
            </span>
            <span className="text-xs text-slate-500 font-medium">• Sexta-feira, 14 de Novembro</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tight">
            Olá, Patrícia ✨
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">
            Seu centro de comando financeiro e de pessoal está pronto. Nenhuma diária é liquidada sem seu aval direto.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/validacoes"
            className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-emerald-700/25 flex items-center gap-2.5 active:scale-95"
          >
            <CalendarCheck2 className="w-4 h-4" />
            <span>Fila de Aprovação (3)</span>
          </Link>
          <Link
            href="/bordero"
            className="px-5 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Borderô Semanal</span>
          </Link>
        </div>
      </div>

      {/* Hero: O 'Cofre Executivo' da Patrícia */}
      <div className="luxury-card-gradient rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
        {/* Glow ambient background decoration */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-20 w-60 h-60 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Posição Consolidada da Semana (Previsão de Sexta)</span>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium block">Total Líquido Estimado a Pagar</span>
              <div className="text-4xl md:text-5xl font-black tracking-tight text-white flex items-baseline gap-2">
                <span>R$ 6.420,00</span>
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                  4 Canteiros
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
              O valor acima já deduz R$ 1.850,00 em vales que os encarregados deram aos colaboradores ao longo da semana.
            </p>
          </div>

          {/* Quick Metrics Inside the Vault */}
          <div className="grid grid-cols-2 gap-4 shrink-0">
            <div className="bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60 space-y-1">
              <div className="text-[11px] text-slate-400 font-medium">Vales Deduzidos</div>
              <div className="text-xl font-black text-rose-400">- R$ 1.850,00</div>
              <div className="text-[10px] text-slate-400">Proteção de caixa ativa</div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60 space-y-1">
              <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <CloudSun className="w-3.5 h-3.5 text-sky-400" /> Previsão Clima
              </div>
              <div className="text-xl font-black text-sky-300">Chuva 40%</div>
              <div className="text-[10px] text-slate-400">OpenWeather ativo</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pendências</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">3 Lotes</div>
            <div className="text-xs text-amber-600 font-semibold mt-0.5">Aguardando seu clique de aprovação</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Canteiros Ativos</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <HardHat className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">4 Obras</div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Bahia, Jabaquara, Alphaville e Barra</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Equipe de Campo</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">18 Operários</div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Com chave PIX verificada</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Segurança de Caixa</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-700">100% Blindado</div>
            <div className="text-xs text-emerald-600 font-semibold mt-0.5">Sem pagamento automático da IA</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Terminal IA + Quick Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Terminal Omnichannel & IA
              </h2>
              <p className="text-xs text-slate-500">
                Converse com o Gemini ou veja o processamento das mensagens do WhatsApp
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              Online
            </span>
          </div>

          <TerminalIA />
        </div>

        <div className="space-y-6">
          {/* Quick Guide Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Atalhos Imediatos</span>
            </div>

            <div className="space-y-2.5">
              <Link
                href="/validacoes"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-200 transition-all text-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center font-bold text-xs">
                    3
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

          {/* Philosophy Note */}
          <div className="bg-gradient-to-br from-slate-950 to-slate-900 text-white p-6 rounded-3xl border border-slate-800 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Filosofia de Segurança</span>
            </div>
            <h4 className="text-sm font-bold text-white">Você tem o controle absoluto</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              O sistema lê os áudios e textos informais do WhatsApp para você não perder tempo digitando. Mas o fechamento de caixa só acontece após a sua validação.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
