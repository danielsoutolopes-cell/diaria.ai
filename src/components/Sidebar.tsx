'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  CalendarCheck2,
  Layers,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  QrCode,
  Users,
  LogOut,
  BarChart3,
  HelpCircle,
  Shield,
} from 'lucide-react';

const navItems = [
  {
    name: 'Visão Geral & Caixa',
    href: '/',
    icon: LayoutDashboard,
    badge: null,
  },
  {
    name: 'Validações Pendentes',
    href: '/validacoes',
    icon: CalendarCheck2,
    badge: null,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    name: 'Lançamentos em Lote (Setup)',
    href: '/setup',
    icon: Layers,
    badge: null,
  },
  {
    name: 'Fechamento (Borderô)',
    href: '/bordero',
    icon: FileSpreadsheet,
    badge: 'Sexta VIP',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    name: 'Relatórios & Exportações',
    href: '/relatorios',
    icon: BarChart3,
    badge: 'XLS',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    name: 'Configuração do Bot (WhatsApp)',
    href: '/whatsapp',
    icon: QrCode,
    badge: 'Online',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    name: 'Configurações de Acesso (RBAC)',
    href: '/configuracoes',
    icon: Users,
    badge: null,
  },
  {
    name: 'Manual & Ajuda',
    href: '/ajuda',
    icon: HelpCircle,
    badge: 'Guia',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
  {
    name: 'Sobre a GADAP',
    href: '/gadap',
    icon: Shield,
    badge: 'Marca',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  {
    name: 'Nossos Produtos',
    href: '/produtos',
    icon: Layers,
    badge: 'Hub',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    document.cookie = 'diaria_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'diaria_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'diaria_tenant=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    router.push('/login');
  }

  return (
    <aside className="w-72 bg-slate-950 text-white min-h-screen flex flex-col border-r border-slate-800/80 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800/80">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[1.5px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950"></span>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-base tracking-tight text-white">
                Ponto Patrícia
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/50">
                PRO
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Controle de Campo & Finanças</p>
          </div>
        </div>
      </div>

      {/* User / Profile Header */}
      <div className="px-5 py-4 mx-4 mt-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800/50 border border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
            P
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-slate-200 truncate">Patrícia Grubel</h4>
            <span className="text-[11px] text-emerald-400/90 font-medium flex items-center gap-1 truncate">
              <ShieldCheck className="w-3 h-3 shrink-0" /> Administradora Central
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          title="Sair do Sistema"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 px-3 mb-2 flex items-center justify-between">
          <span>Módulos de Gestão</span>
          <TrendingUp className="w-3 h-3 text-slate-400" />
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/50 font-semibold'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-400'
                  }`}
                />
                <span className="tracking-tight text-xs font-semibold">{item.name}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isActive
                      ? 'bg-white/20 text-white border-white/30'
                      : item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer System Status */}
      <div className="p-5 border-t border-slate-800/80 bg-slate-950/50 space-y-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] text-slate-300 font-medium">WhatsApp Bot & IA</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
            Conectado
          </span>
        </div>

        <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
          <span>Blindagem</span>
          <span className="text-emerald-400/90 font-medium">Human-in-the-Loop</span>
        </div>
      </div>
    </aside>
  );
}
