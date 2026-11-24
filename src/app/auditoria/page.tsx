'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const SaudeSistemaPanel = dynamic(
  () => import('@/components/SaudeSistemaPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-center text-xs font-bold text-slate-500 animate-pulse">
        Carregando painel de Saúde do Sistema...
      </div>
    ),
  }
);

export default function AuditoriaPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <SaudeSistemaPanel />
    </div>
  );
}
