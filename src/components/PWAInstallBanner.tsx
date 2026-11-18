'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, Download, X, Share } from 'lucide-react';

export default function PWAInstallBanner() {
  const [dispositivo, setDispositivo] = useState<'IOS' | 'ANDROID' | 'DESKTOP' | null>(null);
  const [jaInstalado, setJaInstalado] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [fechado, setFechado] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Detectar se já está rodando como App instalado (standalone)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setJaInstalado(isStandalone);

    // Detectar dispositivo (Celular vs Computador)
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      setDispositivo('IOS');
    } else if (/Android/i.test(ua)) {
      setDispositivo('ANDROID');
    } else {
      setDispositivo('DESKTOP');
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (jaInstalado || fechado || !dispositivo) return null;

  // Só mostra se tiver prompt nativo (Android/Desktop) ou se for iOS (instrução manual)
  if (dispositivo !== 'IOS' && !deferredPrompt) return null;

  async function handleInstalar() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setFechado(true);
    }
    setDeferredPrompt(null);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-950 text-white p-4 rounded-2xl border border-emerald-500/40 shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 print:hidden">
      <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
        {dispositivo === 'DESKTOP' ? (
          <Monitor className="w-5 h-5" />
        ) : (
          <Smartphone className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black text-white">
            Instalar Ponto Patrícia ({dispositivo === 'DESKTOP' ? 'Computador' : 'Celular'})
          </span>
          <button
            type="button"
            onClick={() => setFechado(true)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {dispositivo === 'IOS' ? (
          <p className="text-[11px] text-slate-300 leading-snug">
            No iPhone, toque em <Share className="w-3 h-3 inline text-sky-400" /> <strong>Compartilhar</strong> e depois em{' '}
            <strong>Adicionar à Tela de Início</strong> para abrir como App.
          </p>
        ) : (
          <>
            <p className="text-[11px] text-slate-300 leading-snug">
              Instale o aplicativo em tela cheia para aprovar diárias e vales com 1 toque.
            </p>
            <button
              type="button"
              onClick={handleInstalar}
              className="mt-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Instalar App Agora</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
