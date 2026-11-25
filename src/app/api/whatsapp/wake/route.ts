import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TENANTS } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const TRAVA_HIBERNACAO_MS = 3 * 60 * 1000; // 3 minutos

declare global {
  var __whatsappWakeLockUntil: number | undefined;
}

function autorizarWake(req: NextRequest): boolean {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.get('authorization') || '').trim();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  // Também permite chamada autenticada da própria UI (cookie de sessão)
  const hasAuthCookie = Boolean(req.cookies.get('diaria_auth')?.value);
  const hasUserCookie = Boolean(req.cookies.get('diaria_user')?.value);
  if (hasAuthCookie || hasUserCookie) {
    return true;
  }
  // Se CRON_SECRET não estiver configurado no ambiente, permite wake seguro
  return !cronSecret;
}

export async function POST(req: NextRequest) {
  if (!autorizarWake(req)) {
    return NextResponse.json(
      { error: 'Não autorizado para acionar /api/whatsapp/wake.' },
      { status: 401 }
    );
  }

  // Respeita modo STAND-BY configurado em /setup (bloqueia auto-wake indesejado)
  try {
    const { data } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', TENANTS.jhoston.id)
      .limit(1)
      .maybeSingle();
    const cfg = (data?.configuracoes || {}) as Record<string, unknown>;
    if (cfg.whatsapp_standby === true) {
      return NextResponse.json({
        success: true,
        standby: true,
        status: 'STAND_BY',
        message:
          'WhatsApp está em STAND-BY (/setup). Auto-wake bloqueado; sessão preservada no Supabase.',
      });
    }
  } catch {
    // segue
  }

  const agora = Date.now();
  global.__whatsappWakeLockUntil = Math.max(
    global.__whatsappWakeLockUntil || 0,
    agora + TRAVA_HIBERNACAO_MS
  );

  const baileysUrl = (
    process.env.BAILEYS_SERVER_URL || 'http://127.0.0.1:3001'
  ).replace(/\/$/, '');

  let status = 'CONNECTING';
  let groupsCount = 0;

  try {
    const resStatus = await fetch(`${baileysUrl}/status`, {
      cache: 'no-store',
    });
    if (resStatus.ok) {
      const data = (await resStatus.json()) as {
        status?: string;
        groups?: unknown[];
      };
      status = data.status || 'DISCONNECTED';
      groupsCount = Array.isArray(data.groups) ? data.groups.length : 0;

      if (status === 'DISCONNECTED') {
        await fetch(`${baileysUrl}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fresh: false }),
        }).catch(() => {});
        status = 'CONNECTING';
      }
    }
  } catch {
    status = 'DISCONNECTED';
  }

  return NextResponse.json({
    success: true,
    status,
    groupsCount,
    travaHibernacaoAte: new Date(global.__whatsappWakeLockUntil).toISOString(),
    message:
      status === 'CONNECTED'
        ? 'WhatsApp conectado e sincronizado.'
        : 'Instância acordada — sincronizando sessão Baileys no Supabase.',
  });
}
