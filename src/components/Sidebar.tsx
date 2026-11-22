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
  MessageSquare,
  Receipt,
  Camera,
  Building2,
  ShoppingCart,
  ShieldAlert,
} from 'lucide-react';
import {
  getActiveTenantFromBrowser,
  isDanielOuPatricia,
  setActiveTenantInBrowser,
  TENANTS,
  type TenantConfig,
  type TenantSlug,
} from '@/lib/tenant';

const navItems = [
  {
    name: 'Visão Geral & Caixa',
    href: '/',
    icon: LayoutDashboard,
    badge: null,
  },
  {
    name: 'PitWall F1 (Telemetria)',
    href: '/pitwall',
    icon: TrendingUp,
    badge: 'LIVE',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  {
    name: 'Validações Pendentes',
    intermackName: 'Validações de Efetivo',
    href: '/validacao/diarias',
    icon: CalendarCheck2,
    badge: null,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    name: 'Vales em 2 Etapas (PIX)',
    href: '/validacao/vales',
    icon: Receipt,
    badge: 'PIX',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    onlyDiarista: true,
  },
  {
    name: 'Diário de Obra (Fotos)',
    href: '/diario-obra',
    icon: Camera,
    badge: '2-3 Fotos',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  {
    name: 'Propostas & Medição IA',
    href: '/medicoes',
    icon: Sparkles,
    badge: 'IA',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  {
    name: 'Pedidos de Compras (IA)',
    href: '/compras',
    icon: ShoppingCart,
    badge: 'Compras',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    onlyComprasAtivo: true,
  },
  {
    name: 'Caixinha de Campo (Unificado)',
    href: '/caixinha',
    icon: Receipt,
    badge: 'Campo',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    onlyDiarista: true,
  },
  {
    name: 'Caixa de Campo & Reembolsos',
    href: '/reembolsos',
    icon: Receipt,
    badge: 'Despesas',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    onlyDiarista: true,
  },
  {
    name: 'Lançamentos em Lote (Setup)',
    intermackName: 'Obras & Empreiteiros',
    href: '/setup',
    icon: Layers,
    badge: null,
  },
  {
    name: 'Fechamento & Pagamentos (PIX)',
    href: '/bordero',
    icon: FileSpreadsheet,
    badge: 'Quinzenal',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    onlyDiarista: true,
  },
  {
    name: 'Conciliação Bancária (OFX/CSV)',
    href: '/conciliacao',
    icon: Receipt,
    badge: 'PIX',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    onlyDiarista: true,
  },
  {
    name: 'Relatórios & Exportações',
    intermackName: 'Relatório de Efetivo',
    href: '/relatorios',
    icon: BarChart3,
    badge: 'XLS',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    name: 'Saúde do Sistema (IA)',
    href: '/auditoria',
    icon: ShieldAlert,
    badge: 'Saúde IA',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    name: 'Mensageria & Pedidos IA',
    href: '/mensageria',
    icon: MessageSquare,
    badge: 'Novo',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
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
    name: 'Configuração Geral (Hub)',
    href: '/config-geral',
    icon: ShieldCheck,
    badge: 'Admin',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
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
  const [currentUser, setCurrentUser] = React.useState<string>('Patrícia Grubel');
  const [activeTenant, setActiveTenant] = React.useState<TenantConfig>(TENANTS.jhoston);
  const [pendentesBadge, setPendentesBadge] = React.useState<number>(0);

  React.useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const raw = userCookie.split('=')[1] || '';
      let nome = raw;
      try {
        nome = decodeURIComponent(decodeURIComponent(raw));
      } catch {
        nome = decodeURIComponent(raw).replace(/%20/g, ' ');
      }
      if (nome) setCurrentUser(nome.trim());
    }
    setActiveTenant(getActiveTenantFromBrowser());

    fetch('/api/dashboard', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { lotesPendentes?: number }) => {
        if (typeof d.lotesPendentes === 'number') setPendentesBadge(d.lotesPendentes);
      })
      .catch(() => {});
  }, []);

  const isDanielOrPatricia = isDanielOuPatricia(currentUser);
  const isIntermack = activeTenant.slug === 'intermack';

  function handleTrocarEmpresa(slug: TenantSlug) {
    if (slug === 'intermack' && !isDanielOrPatricia) return;
    setActiveTenantInBrowser(slug);
    setActiveTenant(TENANTS[slug]);
    window.location.reload();
  }

  const visibleNavItems = navItems.filter((item) => {
    if (
      item.href === '/mensageria' ||
      item.href === '/config-geral' ||
      item.href === '/auditoria'
    ) {
      return isDanielOrPatricia;
    }
    if ('onlyComprasAtivo' in item && item.onlyComprasAtivo) {
      return activeTenant.moduloComprasAtivo;
    }
    if (isIntermack && 'onlyDiarista' in item && item.onlyDiarista) {
      return false;
    }
    return true;
  });

  function handleLogout() {
    document.cookie = 'diaria_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'diaria_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'diaria_tenant=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    router.push('/login');
  }

  if (pathname === '/login' || pathname?.startsWith('/extrato/')) {
    return null;
  }

  return (
    <aside className="hidden lg:flex w-72 bg-slate-950 text-white min-h-screen flex-col border-r border-slate-800/80 shrink-0 select-none">
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
                {isIntermack ? 'Intermack' : 'Ponto Patrícia'}
              </h1>
              <span
                className={`text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded border ${
                  isIntermack
                    ? 'text-indigo-300 bg-indigo-950/80 border-indigo-700/60'
                    : 'text-emerald-400 bg-emerald-950/80 border-emerald-800/50'
                }`}
              >
                {isIntermack ? 'EMPREITA' : 'PRO'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              {activeTenant.subtitulo}
            </p>
          </div>
        </div>

        {/* Seletor Multi-Empresa: Exclusivo Patrícia Grubel & Daniel Lopes */}
        {isDanielOrPatricia && (
          <div className="mt-4 p-1 bg-slate-900 rounded-xl border border-slate-800 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => handleTrocarEmpresa('jhoston')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                !isIntermack
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Jhoston</span>
            </button>
            <button
              type="button"
              onClick={() => handleTrocarEmpresa('intermack')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                isIntermack
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Intermack</span>
            </button>
          </div>
        )}
      </div>

      {/* User / Profile Header */}
      <div className="px-5 py-4 mx-4 mt-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800/50 border border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
            {currentUser.trim().charAt(0).toUpperCase() || 'P'}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-slate-200 truncate">{currentUser}</h4>
            <span className="text-[11px] text-emerald-400/90 font-medium flex items-center gap-1 truncate">
              <ShieldCheck className="w-3 h-3 shrink-0" /> Administrador
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
      <nav className="flex-1 px-4 py-5 space-y-1.5">
        {/* Atalho visual da Paleta de Comandos (Ctrl + K) */}
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
            )
          }
          className="w-full mb-3 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center justify-between transition-colors"
          title="Abrir busca rápida de telas e ações"
        >
          <span>Busca rápida...</span>
          <kbd className="text-[10px] font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">
            Ctrl K
          </kbd>
        </button>

        <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 px-3 mb-2 flex items-center justify-between">
          <span>Módulos de Gestão</span>
          <TrendingUp className="w-3 h-3 text-slate-400" />
        </div>

        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          const displayName =
            isIntermack && 'intermackName' in item && item.intermackName
              ? item.intermackName
              : item.name;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? isIntermack
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-950/50 font-semibold'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/50 font-semibold'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    isActive
                      ? 'text-white'
                      : isIntermack
                        ? 'text-slate-400 group-hover:text-indigo-400'
                        : 'text-slate-400 group-hover:text-emerald-400'
                  }`}
                />
                <span className="tracking-tight text-xs font-semibold">{displayName}</span>
              </div>

              {(item.badge || (item.href === '/validacoes' && pendentesBadge > 0)) && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isActive
                      ? 'bg-white/20 text-white border-white/30'
                      : item.href === '/validacoes' && pendentesBadge > 0
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {item.href === '/validacoes' && pendentesBadge > 0
                    ? pendentesBadge
                    : item.badge}
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
