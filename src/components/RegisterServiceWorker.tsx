'use client';

import { useEffect } from 'react';

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('PWA ServiceWorker registrado com sucesso:', registration.scope);
          })
          .catch((error) => {
            console.error('Falha ao registrar ServiceWorker:', error);
          });
      });
    }
  }, []);

  return null;
}

