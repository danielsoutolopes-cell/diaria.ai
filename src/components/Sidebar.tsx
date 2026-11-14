'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarCheck2,
  Layers,
  FileSpreadsheet,
  Bot,
  Settings,
  LayoutDashboard,
  HardHat,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  {
    name: 'Dashboard Geral',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    name: 'Validações Pendentes',
    href: '/validacoes',
    icon: CalendarCheck2,
    badge: 'Human-in-the-Loop',
  },
  {
    name: 'Lançamentos em Lote (Setup)',
    href: '/setup',
    icon: Layers,
  },
  {
    name: 'Fechamento (Borderô)',
    href: '/bordero',
    icon: FileSpreadsheet,
    badge: 'Sexta',
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col border-r border-slate-800 shrink-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500 rounded-xl text-slate-950 font-bold shadow-lg shadow-emerald-500/20">
          <HardHat className="w-6 h-6 text-slate-950" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight text-white">
            Ponto Patrícia
          </h1>
          <p className="text-xs text-emerald-400 font-medium">Micro-ERP de Campo</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 px-3 mb-2">
          Módulos Principais
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                  isActive ? 'bg-emerald-800/80 text-emerald-100' : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
        <div className="flex items-center justify-between">
          <span>Status do Bot</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Online (Render)
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-500 text-[11px]">
          <span>IA Engine</span>
          <span>Gemini 1.5 Flash</span>
        </div>
      </div>
    </aside>
  );
}
