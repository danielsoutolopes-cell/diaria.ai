import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TENANTS } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export type FarolCor = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'STAND_BY';

export async function GET() {
  // Verifica flag whatsapp_standby no Supabase
  let standby = false;
  try {
    const { data } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', TENANTS.jhoston.id)
      .limit(1)
      .maybeSingle();
    const cfg = (data?.configuracoes || {}) as Record<string, unknown>;
    standby = cfg.whatsapp_standby === true;
  } catch {
    // segue
  }

  if (standby) {
    return NextResponse.json(
      {
        farol: 'STAND_BY' as FarolCor,
        status: 'STAND_BY',
        standby: true,
        connectedAt: null,
        lastSyncAt: null,
        groupsCount: 0,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const baileysUrl = (
    process.env.BAILEYS_SERVER_URL || 'http://127.0.0.1:3001'
  ).replace(/\/$/, '');

  let status = 'DISCONNECTED';
  let connectedAt: string | null = null;
  let lastSyncAt: string | null = null;
  let groupsCount = 0;

  try {
    const res = await fetch(`${baileysUrl}/status`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as {
        status?: string;
        connectedAt?: string | null;
        lastSyncAt?: string | null;
        session?: {
          status?: string;
          connectedAt?: string | null;
          lastSyncAt?: string | null;
        };
        groups?: unknown[];
      };
      status = data.session?.status || data.status || 'DISCONNECTED';
      connectedAt = data.session?.connectedAt || data.connectedAt || null;
      lastSyncAt = data.session?.lastSyncAt || data.lastSyncAt || null;
      groupsCount = Array.isArray(data.groups) ? data.groups.length : 0;
    }
  } catch {
    status = 'DISCONNECTED';
  }

  const farol: FarolCor =
    status === 'CONNECTED'
      ? 'VERDE'
      : status === 'CONNECTING'
        ? 'AMARELO'
        : 'VERMELHO';

  return NextResponse.json(
    {
      farol,
      status,
      connectedAt,
      lastSyncAt,
      groupsCount,
      travaHibernacaoAte: global.__whatsappWakeLockUntil
        ? new Date(global.__whatsappWakeLockUntil).toISOString()
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
