'use client';

import React from 'react';
import ValidacaoTabsHeader from '@/components/ValidacaoTabsHeader';
import ValidacoesPage from '@/app/validacoes/page';

export default function ValidacaoDiariasPage() {
  return (
    <div>
      <ValidacaoTabsHeader activeTab="diarias" />
      <ValidacoesPage />
    </div>
  );
}
