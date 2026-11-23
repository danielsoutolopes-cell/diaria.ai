'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Rota legada `/reembolsos`: redireciona automaticamente para a visão unificada
 * `/caixinha?secao=reembolsos`, eliminando duplicidade no menu sem quebrar links antigos.
 */
export default function ReembolsosRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/caixinha?secao=reembolsos');
  }, [router]);

  return (
    <div className="p-8 max-w-xl mx-auto text-center text-xs font-semibold text-slate-500">
      Redirecionando para o Caixinha de Campo (Reembolsos &amp; Adiantamentos)...
    </div>
  );
}
