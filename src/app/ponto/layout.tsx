import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ponto de Campo | App Instalável',
  description:
    'Marcação de ponto diário e relatório semanal de obra (3 fotos) para encarregados em campo.',
  manifest: '/manifest-ponto.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ponto Campo',
  },
};

export default function PontoCampoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
