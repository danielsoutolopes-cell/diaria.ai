import type { NextRequest } from 'next/server';

export type TenantSlug = 'jhoston' | 'intermack';
export type LegacyTenantSlug = TenantSlug | 'jhonton' | 'joston';
export type TenantModo = 'DIARISTA' | 'EMPREITA';

export interface TenantConfig {
  slug: TenantSlug;
  id: string;
  nome: string;
  razaoSocial: string;
  subtitulo: string;
  modo: TenantModo;
  exclusivoAdmins: boolean;
  moduloComprasAtivo: boolean;
}

export const TENANTS: Record<TenantSlug, TenantConfig> = {
  jhoston: {
    slug: 'jhoston',
    id: '00000000-0000-0000-0000-000000000001',
    nome: 'Jhoston',
    razaoSocial: 'Jhoston Construções e Revestimentos',
    subtitulo: 'Diárias & Folha de Campo',
    modo: 'DIARISTA',
    exclusivoAdmins: false,
    moduloComprasAtivo: false,
  },
  intermack: {
    slug: 'intermack',
    id: '00000000-0000-0000-0000-000000000002',
    nome: 'Intermack',
    razaoSocial: 'Intermack Engenharia e Construção',
    subtitulo: 'Empreita • Efetivo & Diário de Obra',
    modo: 'EMPREITA',
    exclusivoAdmins: true,
    moduloComprasAtivo: true,
  },
};

/**
 * Normaliza slugs atuais e legados ('jhonton', 'joston', UUIDs) para o TenantSlug canônico.
 */
export function normalizeTenantSlug(rawSlug: string | null | undefined): TenantSlug {
  const normalized = (rawSlug || '').trim().toLowerCase();
  if (normalized === 'intermack' || normalized === TENANTS.intermack.id) {
    return 'intermack';
  }
  // Retrocompatibilidade explícita para cookies/JSONs salvos com a grafia antiga 'jhonton'
  return 'jhoston';
}

export function isDanielOuPatricia(user: string | null | undefined): boolean {
  if (!user) return false;
  const u = user.toLowerCase();
  return (
    u.includes('patr') ||
    u.includes('daniel') ||
    u.includes('11978543369') ||
    u.includes('11988139833') ||
    u.includes('11913192703')
  );
}

export function resolveTenantConfig(
  rawSlug: string | null | undefined,
  user: string | null | undefined
): TenantConfig {
  const slug = normalizeTenantSlug(rawSlug);
  if (slug === 'intermack') {
    // Regra estrita: Intermack é exclusivo para Patrícia Grubel e Daniel Lopes
    if (isDanielOuPatricia(user)) {
      return TENANTS.intermack;
    }
  }
  return TENANTS.jhoston;
}

export function getActiveTenantFromRequest(req: NextRequest): TenantConfig {
  const rawTenant =
    req.cookies.get('diaria_tenant')?.value ||
    req.headers.get('x-diaria-tenant') ||
    null;
  const rawUser = req.cookies.get('diaria_user')?.value
    ? decodeURIComponent(req.cookies.get('diaria_user')?.value || '')
    : null;

  return resolveTenantConfig(rawTenant, rawUser);
}

export function getActiveTenantFromBrowser(): TenantConfig {
  if (typeof document === 'undefined') {
    return TENANTS.jhoston;
  }
  const cookies = document.cookie.split('; ');
  const tenantCookie = cookies.find((c) => c.startsWith('diaria_tenant='));
  const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
  const rawTenant = tenantCookie ? decodeURIComponent(tenantCookie.split('=')[1]) : null;
  const rawUser = userCookie ? decodeURIComponent(userCookie.split('=')[1]) : 'Patrícia Grubel';

  return resolveTenantConfig(rawTenant, rawUser);
}

export function setActiveTenantInBrowser(slug: LegacyTenantSlug): void {
  if (typeof document === 'undefined') return;
  const canonicalSlug = normalizeTenantSlug(slug);
  document.cookie = `diaria_tenant=${canonicalSlug}; path=/; max-age=31536000; SameSite=Lax`;
}
