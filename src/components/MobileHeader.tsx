'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Sparkles,
  Smartphone,
  Laptop,
  CheckCircle2,
  CalendarCheck2,
  Layers,
  FileSpreadsheet,
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  QrCode,
  Users,
  HelpCircle,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { useDevice } from '@/contexts/DeviceContext';

export default function MobileHeader() {
  const { isMobile, deviceType, viewportWidth } = useDevice();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const mobileNavItems = [
    { name: 'Visão Geral & Caixa', href: '/', icon: LayoutDashboard },
    { name: 'Validações Pendentes', href: '/validacoes', icon: CalendarCheck2 },
    { name: 'Lançamentos em Lote (Setup)', href: '/setup', icon: Layers },
    { name: 'Fechamento (Borderô)', href: '/bordero', icon: FileSpreadsheet },
    { name: 'Relatórios & Exportações', href: '/relatorios', icon: BarChart3 },
    { name: 'Mensageria & Pedidos IA', href: '/mensageria', icon: MessageSquare },
    { name: 'WhatsApp Bot', href: '/whatsapp', icon: QrCode },
    { name: 'Manual & Ajuda', href: '/ajuda', icon: HelpCircle },
  ];

  return (
    <header className="lg:hidden sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800 text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[1.5px] shadow-md shadow-emerald-500/20">
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-extrabold text-sm tracking-tight text-white">
              Ponto Patrícia
            </h1>
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              {isMobile ? 'Mobile' : 'Tablet'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400">Micro-ERP de Campo</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white"
          aria-label="Abrir Menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Drawer Mobile */}
      {menuOpen && (
        <div className="fixed inset-0 top-[57px] bg-slate-950/95 z-50 p-4 space-y-2 overflow-y-auto animate-in fade-in duration-200">
          <div className="p-3 mb-2 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 font-bold text-emerald-400">
              <ShieldCheck className="w-4 h-4" /> Administradora Central
            </span>
            <span className="text-[10px] text-slate-500">{viewportWidth}px</span>
          </div>

          <nav className="space-y-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
