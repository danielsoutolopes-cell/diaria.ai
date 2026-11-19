import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import RegisterServiceWorker from '@/components/RegisterServiceWorker';
import PWAInstallBanner from '@/components/PWAInstallBanner';
import ContextualHelp from '@/components/ContextualHelp';
import CommandPalette from '@/components/CommandPalette';
import NetworkStatusBar from '@/components/NetworkStatusBar';
import { DeviceProvider } from '@/contexts/DeviceContext';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#022c22',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'Ponto Patrícia | Micro-ERP de Campo',
  description: 'Controle inteligente de ponto, vales e diárias de campo com IA Human-in-the-Loop',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ponto Patrícia',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={inter.className}>
        <DeviceProvider>
          <RegisterServiceWorker />
          <NetworkStatusBar />
          <ContextualHelp />
          <CommandPalette />
          <PWAInstallBanner />
          <div className="flex flex-col lg:flex-row min-h-screen max-w-[100vw] overflow-x-hidden">
            <MobileHeader />
            <Sidebar />
            <main className="flex-1 bg-slate-50 min-h-screen overflow-y-auto overflow-x-hidden w-full">
              <div className="w-full max-w-7xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </DeviceProvider>
      </body>
    </html>
  );
}
