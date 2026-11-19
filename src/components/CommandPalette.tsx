'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  CalendarCheck2,
  Receipt,
  FileSpreadsheet,
  BarChart3,
  Camera,
  Sparkles,
  Layers,
  QrCode,
  ShieldCheck,
  HelpCircle,
  Building2,
  X,
} from 'lucide-react';
import {
  getActiveTenantFromBrowser,
  isDanielOuPatricia,
  setActiveTenantInBrowser,
} from '@/lib/tenant';

interface CommandItem {
  id: string;
  label: string;
  category: string;
  href?: string;
  action?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    const raw = userCookie ? userCookie.split('=')[1] : 'Patrícia Grubel';
    let nome = raw;
    try {
      nome = decodeURIComponent(decodeURIComponent(raw));
    } catch {
      nome = decodeURIComponent(raw).replace(/%20/g, ' ');
    }
    setIsAdmin(isDanielOuPatricia(nome));

    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commands: CommandItem[] = useMemo(() => {
    const active = getActiveTenantFromBrowser();
    const list: CommandItem[] = [
      { id: 'dash', label: 'Visão Geral & Caixa', category: 'Navegação', href: '/', icon: LayoutDashboard },
      { id: 'val', label: 'Validações Pendentes / Efetivo', category: 'Navegação', href: '/validacoes', icon: CalendarCheck2 },
      { id: 'diario', label: 'Diário de Obra (2 a 3 Fotos)', category: 'Navegação', href: '/diario-obra', icon: Camera },
      { id: 'med', label: 'Propostas & Medição IA', category: 'Navegação', href: '/medicoes', icon: Sparkles },
      { id: 'caixa', label: 'Caixa de Campo & Reembolsos', category: 'Navegação', href: '/reembolsos', icon: Receipt },
      { id: 'fech', label: 'Fechamento & Pagamentos (PIX)', category: 'Navegação', href: '/bordero', icon: FileSpreadsheet },
      { id: 'rel', label: 'Relatórios & Exportações (1 a 6)', category: 'Navegação', href: '/relatorios', icon: BarChart3 },
      { id: 'setup', label: 'Obras & Equipes (Setup)', category: 'Navegação', href: '/setup', icon: Layers },
      { id: 'zap', label: 'Conexão do Bot (WhatsApp)', category: 'Navegação', href: '/whatsapp', icon: QrCode },
      { id: 'hub', label: 'Configuração Geral (Hub Multi-Empresa)', category: 'Administração', href: '/config-geral', icon: ShieldCheck, adminOnly: true },
      { id: 'ajuda', label: 'Manual & Ajuda', category: 'Suporte', href: '/ajuda', icon: HelpCircle },
      {
        id: 'switch-tenant',
        label:
          active.slug === 'intermack'
            ? 'Trocar empresa para Jhonton (Modo Diarista)'
            : 'Trocar empresa para Intermack (Modo Empreita)',
        category: 'Multi-Empresa',
        icon: Building2,
        adminOnly: true,
        action: () => {
          setActiveTenantInBrowser(active.slug === 'intermack' ? 'jhonton' : 'intermack');
          window.location.reload();
        },
      },
    ];
    return list.filter((c) => !c.adminOnly || isAdmin);
  }, [isAdmin]);

  const filtered = commands.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-start justify-center pt-[12vh] p-4 print:hidden"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ir para tela ou ação... (Ctrl + K)"
            className="flex-1 text-sm font-medium text-slate-900 outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Fechar paleta de comandos"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              Nenhum comando encontrado para &quot;{query}&quot;.
            </p>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setQuery('');
                    if (item.action) item.action();
                    else if (item.href) router.push(item.href);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl hover:bg-slate-100 flex items-center justify-between text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-slate-500 group-hover:text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-semibold">
          <span>Dica: use Ctrl + K em qualquer tela</span>
          <span>ESC para fechar</span>
        </div>
      </div>
    </div>
  );
}
