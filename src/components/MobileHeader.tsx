'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Sparkles,
  CalendarCheck2,
  Layers,
  FileSpreadsheet,
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  QrCode,
  HelpCircle,
  ShieldCheck,
  Camera,
  Receipt,
  Building2,
  ShoppingCart,
  ShieldAlert,
} from 'lucide-react';
import { useDevice } from '@/contexts/DeviceContext';
import {
  getActiveTenantFromBrowser,
  isDanielOuPatricia,
  setActiveTenantInBrowser,
  TENANTS,
  type TenantConfig,
  type TenantSlug,
} from '@/lib/tenant';

export default function MobileHeader() {
  const { isMobile, viewportWidth } = useDevice();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>('Patrícia Grubel');
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.jhoston);
  const pathname = usePathname() || '/';

  useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const raw = userCookie.split('=')[1] || '';
      try {
        setCurrentUser(decodeURIComponent(decodeURIComponent(raw)).trim());
      } catch {
        setCurrentUser(decodeURIComponent(raw).replace(/%20/g, ' ').trim());
      }
    }
    setActiveTenant(getActiveTenantFromBrowser());
  }, []);

  if (pathname === '/login' || pathname.startsWith('/extrato/')) {
    return null;
  }

  const isAdmin = isDanielOuPatricia(currentUser);
  const isIntermack = activeTenant.slug === 'intermack';

  function handleTrocarEmpresa(slug: TenantSlug) {
    if (slug === 'intermack' && !isAdmin) return;
    setActiveTenantInBrowser(slug);
    setActiveTenant(TENANTS[slug]);
    setMenuOpen(false);
    window.location.reload();
  }

  const allNavItems = [
    { name: 'Visão Geral & Caixa', href: '/', icon: LayoutDashboard },
    {
      name: isIntermack ? 'Validações de Efetivo' : 'Validações (Diárias)',
      href: '/validacao/diarias',
      icon: CalendarCheck2,
    },
    {
      name: 'Vales em 2 Etapas (PIX)',
      href: '/validacao/vales',
      icon: Receipt,
      onlyDiarista: true,
    },
    { name: 'Diário de Obra (2-3 Fotos)', href: '/diario-obra', icon: Camera },
    { name: 'Propostas & Medição IA', href: '/medicoes', icon: Sparkles },
    {
      name: 'Pedidos de Compras (IA)',
      href: '/compras',
      icon: ShoppingCart,
      onlyComprasAtivo: true,
    },
    {
      name: 'Caixinha de Campo (Unificado)',
      href: '/caixinha',
      icon: Receipt,
      onlyDiarista: true,
    },
    {
      name: 'Caixa de Campo & Reembolsos',
      href: '/reembolsos',
      icon: Receipt,
      onlyDiarista: true,
    },
    {
      name: isIntermack ? 'Obras & Empreiteiros' : 'Lançamentos em Lote (Setup)',
      href: '/setup',
      icon: Layers,
    },
    {
      name: 'Fechamento & Pagamentos (PIX)',
      href: '/bordero',
      icon: FileSpreadsheet,
      onlyDiarista: true,
    },
    {
      name: 'Conciliação Bancária (OFX/CSV)',
      href: '/conciliacao',
      icon: Receipt,
      onlyDiarista: true,
    },
    {
      name: isIntermack ? 'Relatório de Efetivo' : 'Relatórios & Exportações',
      href: '/relatorios',
      icon: BarChart3,
    },
    {
      name: 'Saúde do Sistema (IA)',
      href: '/auditoria',
      icon: ShieldAlert,
      adminOnly: true,
    },
    {
      name: 'Mensageria & Pedidos IA',
      href: '/mensageria',
      icon: MessageSquare,
      adminOnly: true,
    },
    { name: 'WhatsApp Bot', href: '/whatsapp', icon: QrCode },
    {
      name: 'Configuração Geral (Hub)',
      href: '/config-geral',
      icon: ShieldCheck,
      adminOnly: true,
    },
    { name: 'Manual & Ajuda', href: '/ajuda', icon: HelpCircle },
  ];

  const mobileNavItems = allNavItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if ('onlyComprasAtivo' in item && item.onlyComprasAtivo && !activeTenant.moduloComprasAtivo) {
      return false;
    }
    if (isIntermack && item.onlyDiarista) return false;
    return true;
  });

  return (
    <>
      <header className="lg:hidden sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800 text-white px-3.5 py-2.5 flex items-center justify-between gap-2 print:hidden">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl p-[1.5px] shadow-md shrink-0 ${
              isIntermack
                ? 'bg-gradient-to-tr from-indigo-600 to-blue-400'
                : 'bg-gradient-to-tr from-emerald-600 to-teal-400'
            }`}
          >
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles
                className={`w-4 h-4 ${
                  isIntermack ? 'text-indigo-400' : 'text-emerald-400'
                }`}
              />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-sm tracking-tight text-white truncate">
                {isIntermack ? 'Intermack' : 'Ponto Patrícia'}
              </h1>
              <span
                className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                  isIntermack
                    ? 'bg-indigo-950 text-indigo-300 border-indigo-700/50'
                    : 'bg-emerald-950 text-emerald-400 border-emerald-800/40'
                }`}
              >
                {isIntermack ? 'Empreita' : 'Jhoston'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {activeTenant.subtitulo}
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white active:scale-95 transition-transform flex items-center gap-1.5 shrink-0"
          aria-label={menuOpen ? 'Fechar Menu' : 'Abrir Menu'}
        >
          {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span className="text-[11px] font-bold">
            {menuOpen ? 'Fechar' : 'Menu'}
          </span>
        </button>
      </header>

      {/* Drawer Mobile FORA do <header> (evita clipping causado por backdrop-blur) */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[57px] bottom-0 bg-slate-950 z-[60] p-4 space-y-3 overflow-y-auto">
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 font-bold text-emerald-400 truncate">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="truncate">{currentUser}</span>
            </span>
            <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
              {isMobile ? 'Celular' : 'Tablet'} • {viewportWidth}px
            </span>
          </div>

          {isAdmin && (
            <div className="p-1 bg-slate-900 rounded-xl border border-slate-800 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => handleTrocarEmpresa('jhoston')}
                className={`py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                  !isIntermack
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Jhoston</span>
              </button>
              <button
                type="button"
                onClick={() => handleTrocarEmpresa('intermack')}
                className={`py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                  isIntermack
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Intermack</span>
              </button>
            </div>
          )}

          <nav className="space-y-1 pb-24">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all ${
                    isActive
                      ? isIntermack
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
