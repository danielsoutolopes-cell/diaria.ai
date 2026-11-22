'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck2, Banknote } from 'lucide-react';
import { getActiveTenantFromBrowser } from '@/lib/tenant';

interface ValidacaoTabsHeaderProps {
  activeTab: 'diarias' | 'vales';
}

export default function ValidacaoTabsHeader({
  activeTab,
}: ValidacaoTabsHeaderProps) {
  const [aguardandoPix, setAguardandoPix] = useState<number>(0);
  const [isEmpreita, setIsEmpreita] = useState<boolean>(false);

  useEffect(() => {
    const tenant = getActiveTenantFromBrowser();
    setIsEmpreita(tenant.modo === 'EMPREITA');
    if (tenant.modo !== 'EMPREITA') {
      fetch('/api/vales', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: { kpis?: { aguardandoEnvioPixQtd?: number } }) => {
          if (typeof d.kpis?.aguardandoEnvioPixQtd === 'number') {
            setAguardandoPix(d.kpis.aguardandoEnvioPixQtd);
          }
        })
        .catch(() => {});
    }
  }, []);

  if (isEmpreita) return null;

  return (
    <div className="px-4 sm:px-8 pt-4 sm:pt-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-2 sm:inline-flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/90 w-full sm:w-auto">
        <Link
          href="/validacao/diarias"
          className={`px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${
            activeTab === 'diarias'
              ? 'bg-slate-950 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarCheck2 className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden">Diárias</span>
          <span className="hidden sm:inline">Diárias &amp; Apontamentos</span>
        </Link>

        <Link
          href="/validacao/vales"
          className={`px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${
            activeTab === 'vales'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Banknote className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden">Vales PIX</span>
          <span className="hidden sm:inline">Vales em 2 Etapas (PIX)</span>
          {aguardandoPix > 0 && (
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums shrink-0 ${
                activeTab === 'vales'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {aguardandoPix}
              <span className="hidden sm:inline">
                {' '}pendente{aguardandoPix > 1 ? 's' : ''}
              </span>
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
