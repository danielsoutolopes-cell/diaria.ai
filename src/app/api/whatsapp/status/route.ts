import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type FarolCor = 'VERDE' | 'AMARELO' | 'VERMELHO';

export async function GET() {
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
        groups?: unknown[];
      };
      status = data.status || 'DISCONNECTED';
      connectedAt = data.connectedAt || null;
      lastSyncAt = data.lastSyncAt || null;
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
