'use client';

import React, { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface DeviceContextType {
  deviceType: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

const DeviceContext = React.createContext<DeviceContextType>({
  deviceType: 'desktop',
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  viewportWidth: 1280,
  viewportHeight: 800,
});

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [device, setDevice] = useState<DeviceContextType>({
    deviceType: 'desktop',
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    function handleResize() {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // User-agent detection fallback
      const ua = navigator.userAgent.toLowerCase();
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);

      let type: DeviceType = 'desktop';
      if (width < 768 || (isMobileUA && width < 900)) {
        type = 'mobile';
      } else if (width >= 768 && width < 1024) {
        type = 'tablet';
      } else {
        type = 'desktop';
      }

      setDevice({
        deviceType: type,
        isMobile: type === 'mobile',
        isTablet: type === 'tablet',
        isDesktop: type === 'desktop',
        viewportWidth: width,
        viewportHeight: height,
      });
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <DeviceContext.Provider value={device}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  return React.useContext(DeviceContext);
}
