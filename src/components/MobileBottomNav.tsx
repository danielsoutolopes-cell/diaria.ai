'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarCheck2,
  Receipt,
  FileSpreadsheet,
  BarChart3,
  ShoppingCart,
  Camera,
  type LucideIcon,
} from 'lucide-react';
import {
  getActiveTenantFromBrowser,
  TENANTS,
  type TenantConfig,
} from '@/lib/tenant';

interface BottomNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  matchPrefixes: string[];
  showPendingBadge?: boolean;
}

export default function MobileBottomNav() {
  const pathname = usePathname() || '/';
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.jhoston);
  const [pendentesBadge, setPendentesBadge] = useState<number>(0);

  useEffect(() => {
    setActiveTenant(getActiveTenantFromBrowser());
    if (
      pathname === '/login' ||
      pathname.startsWith('/extrato/') ||
      pathname === '/ponto' ||
      pathname.startsWith('/ponto/')
    )
      return;

    fetch('/api/dashboard', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { lotesPendentes?: number }) => {
        if (typeof d.lotesPendentes === 'number') {
          setPendentesBadge(d.lotesPendentes);
        }
      })
      .catch(() => {});
  }, [pathname]);

  if (
    pathname === '/login' ||
    pathname.startsWith('/extrato/') ||
    pathname === '/ponto' ||
    pathname.startsWith('/ponto/')
  ) {
    return null;
  }

  const isIntermack = activeTenant.slug === 'intermack';

  const items: BottomNavItem[] = isIntermack
    ? [
        {
          label: 'Início',
          href: '/',
          icon: LayoutDashboard,
          matchPrefixes: ['/'],
        },
        {
          label: 'Efetivo',
          href: '/validacao/diarias',
          icon: CalendarCheck2,
          matchPrefixes: ['/validacao/diarias', '/validacoes'],
          showPendingBadge: true,
        },
        {
          label: 'Compras',
          href: '/compras',
          icon: ShoppingCart,
          matchPrefixes: ['/compras'],
        },
        {
          label: 'Diário',
          href: '/diario-obra',
          icon: Camera,
          matchPrefixes: ['/diario-obra'],
        },
        {
          label: 'Relatórios',
          href: '/relatorios',
          icon: BarChart3,
          matchPrefixes: ['/relatorios'],
        },
      ]
    : [
        {
          label: 'Início',
          href: '/',
          icon: LayoutDashboard,
          matchPrefixes: ['/'],
        },
        {
          label: 'Diárias',
          href: '/validacao/diarias',
          icon: CalendarCheck2,
          matchPrefixes: ['/validacao/diarias', '/validacoes'],
          showPendingBadge: true,
        },
        {
          label: 'Vales',
          href: '/validacao/vales',
          icon: Receipt,
          matchPrefixes: ['/validacao/vales'],
        },
        {
          label: 'PIX',
          href: '/bordero',
          icon: FileSpreadsheet,
          matchPrefixes: ['/bordero'],
        },
        {
          label: 'Relatórios',
          href: '/relatorios',
          icon: BarChart3,
          matchPrefixes: ['/relatorios'],
        },
      ];

  function isItemActive(item: BottomNavItem): boolean {
    if (item.href === '/') return pathname === '/';
    return item.matchPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
  }

  return (
    <nav
      aria-label="Navegação principal mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] pb-safe print:hidden"
    >
      <div className="grid grid-cols-5 h-[60px] max-w-lg mx-auto px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item);
          const activeTextClass = isIntermack
            ? 'text-indigo-600'
            : 'text-emerald-600';
          const activeBarClass = isIntermack
            ? 'bg-indigo-600'
            : 'bg-emerald-600';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors active:scale-95 ${
                active
                  ? activeTextClass
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {active && (
                <span
                  className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full ${activeBarClass}`}
                />
              )}
              <div className="relative">
                <Icon
                  className={`w-5 h-5 ${active ? 'stroke-[2.4]' : 'stroke-[2]'}`}
                />
                {item.showPendingBadge && pendentesBadge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center tabular-nums shadow-xs">
                    {pendentesBadge > 99 ? '99+' : pendentesBadge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] leading-tight tracking-tight ${
                  active ? 'font-extrabold' : 'font-semibold'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
